#!/usr/bin/env python3
"""Asset guard — keeps assets/, the sprite registry, and the import settings from
drifting apart, so dead art can't quietly ride along in the shipped .pck and a
new sprite can't ship with blurry import settings.

This is the static half of ARCHITECTURE.md rule 7 (the runtime half is
tests/test_sprite_registry.gd, which boots Godot and actually loads the textures).

Rules:
  0. Every sprite names a `class` from data/registries/sprite_spec.json, and the PNG
     on disk is the size that class requires. sprite_spec.json is the game's opinion
     about what each KIND of art must be; conforming to it is how new art drops in
     and just works. An asset may override its class only with a `why` recorded
     beside it, so a deviation is a decision on the record, not a drift.
  1. Every sprite/tileset in data/registries/sprite_registry.json exists on disk.
  2. Every PNG under assets/ is claimed by the registry — no orphans. The export
     preset is `all_resources`, so an unreferenced file is dead weight a child
     downloads over mobile data.
  3. The declared frame grid divides the sheet exactly and holds the declared
     frame count.
  4. Every PNG has a .import sibling carrying the pixel-art preset
     (project.godot [importer_defaults]); every .import has its PNG.
  5. No sprite path literals left in .gd — entities name registry keys.
  5b. No hardcoded sprite anchor in a .tscn. `offset = Vector2(0, -28)` on a
     Sprite2D silently encodes half the CURRENT frame height plus any sink, so it
     quietly means something else the moment the art changes size. Anchors are
     derived from the registry at runtime (SpriteSheet.anchor_offset).
  6. Every audio file under assets/audio/ is named by data/audio/audio_manifest.json.
  7. No declared frame is fully transparent, and no two declared frames are byte
     identical — both mean the sheet or the frame count is wrong, and both read as
     a stutter or a gap in play rather than as an error.

Escape hatch: add a path to ALLOW_UNREFERENCED below with a comment saying why.
Run: python3 godot/tools/check_assets.py [--selftest] [--spec]
  --spec prints the delivery brief: what the game requires, per kind of art.
"""
import json
import os
import re
import struct
import zlib
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
ASSETS = os.path.join(ROOT, "assets")
SCRIPTS = os.path.join(ROOT, "scripts")
REGISTRY = os.path.join(ROOT, "data", "registries", "sprite_registry.json")
SPEC = os.path.join(ROOT, "data", "registries", "sprite_spec.json")
TILESET_MANIFEST = os.path.join(ROOT, "data", "tilesets", "tileset_manifest.json")
AUDIO_MANIFEST = os.path.join(ROOT, "data", "audio", "audio_manifest.json")

# Files intentionally kept without a registry entry. Keep this list empty if you
# can — each entry is weight in every build.
ALLOW_UNREFERENCED = {
    # The 784px source the shipped 64px owl was exported from. Nothing loads it,
    # but data/ASSET_CREDITS.json records its licence against this filename, so
    # deleting it would orphan the attribution.
    "assets/sprites/characters/npcs/owl.png": "attribution source in ASSET_CREDITS.json",
}

# The pixel-art contract from project.godot [importer_defaults]. Nearest-neighbour
# upscaling at integer scale is the whole look; these four settings protect it.
REQUIRED_IMPORT = {
    "compress/mode": "0",            # lossless — block compression smears pixel art
    "mipmaps/generate": "false",     # never rendered below 1:1
    "process/fix_alpha_border": "false",  # a bilinear fix; pointless under Nearest
    "detect_3d/compress_to": "0",    # never silently switch to VRAM compression
}

SPRITE_PATH_RE = re.compile(r'"res://assets/[^"]*\.(?:png|jpg|jpeg|webp)"')
ALLOW_LINE = "# asset-ok"
SCENES = os.path.join(ROOT, "scenes")
SPRITE_NODE_RE = re.compile(r'^\[node .*type="(?:Animated)?Sprite2D"')


def rel(path):
    return os.path.relpath(path, ROOT).replace(os.sep, "/")


def png_size(path):
    """(width, height) from the IHDR chunk — no Pillow dependency in CI."""
    with open(path, "rb") as f:
        head = f.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", head[16:24])


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def walk(root, exts):
    out = []
    for dirpath, _, files in os.walk(root):
        for fn in files:
            if os.path.splitext(fn)[1].lower() in exts:
                out.append(os.path.join(dirpath, fn))
    return sorted(out)


def parse_import(path):
    """Flat key=value pairs from a .import file (section headers ignored)."""
    params = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith(("[", ";")) or "=" not in line:
                continue
            k, v = line.split("=", 1)
            params[k.strip()] = v.strip()
    return params


OVERRIDABLE = ("frameWidth", "frameHeight", "anchor")


def resolve(raw, spec):
    """Sprite fields laid over its class defaults, plus the list of overridden keys."""
    cls = raw.get("class", "")
    defaults = spec.get("classes", {}).get(cls, {})
    merged = {k: defaults[k] for k in OVERRIDABLE if k in defaults}
    overridden = [k for k in OVERRIDABLE if k in raw and raw[k] != merged.get(k)]
    merged.update(raw)
    return merged, overridden


# Inlined from the deleted godot/tools/audit_pixel_art.py, which was 357 lines of
# unwired reporting wrapped around this one live function. Deleting that module
# broke CI, because the reference sweep grepped for the FILENAME and a Python
# `import audit_pixel_art` carries no .py. One consumer, so it lives here.
def read_png_rgba(path):
    """Decode an 8-bit PNG to (width, height, bytearray RGBA). Handles colour
    types 0/2/3/4/6 and the five standard filters — enough for game sprites."""
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG: %s" % path)
    pos, idat, palette, trns = 8, bytearray(), None, None
    width = height = depth = ctype = None
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        ctag = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if ctag == b"IHDR":
            width, height, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if depth != 8 or interlace != 0:
                raise ValueError("unsupported PNG (depth=%d interlace=%d): %s" % (depth, interlace, path))
        elif ctag == b"PLTE":
            palette = body
        elif ctag == b"tRNS":
            trns = body
        elif ctag == b"IDAT":
            idat += body
        elif ctag == b"IEND":
            break

    raw = zlib.decompress(bytes(idat))
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    stride = width * channels
    out = bytearray(stride * height)
    prev = bytearray(stride)
    p = 0
    for y in range(height):
        ftype = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride
        if ftype == 1:
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 0xFF
        elif ftype == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ftype == 3:
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ftype == 4:
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                b = prev[i]
                c = prev[i - channels] if i >= channels else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 0xFF
        elif ftype != 0:
            raise ValueError("bad PNG filter %d" % ftype)
        out[y * stride:(y + 1) * stride] = line
        prev = line

    rgba = bytearray(width * height * 4)
    for i in range(width * height):
        s, d = i * channels, i * 4
        if ctype == 6:
            rgba[d:d + 4] = out[s:s + 4]
        elif ctype == 2:
            rgba[d:d + 3] = out[s:s + 3]
            rgba[d + 3] = 255
        elif ctype == 0:
            g = out[s]
            rgba[d:d + 4] = bytes((g, g, g, 255))
        elif ctype == 4:
            g = out[s]
            rgba[d:d + 4] = bytes((g, g, g, out[s + 1]))
        elif ctype == 3:
            idx = out[s]
            rgba[d:d + 3] = palette[idx * 3:idx * 3 + 3]
            rgba[d + 3] = trns[idx] if trns and idx < len(trns) else 255
    return width, height, rgba


# --- metrics ----------------------------------------------------------------


def read_frames(path, fw, fh, count):
    """Grid-slice a PNG into `count` RGBA frame buffers. Reuses the audit tool's
    dependency-free decoder so CI needs no Pillow."""
    sys.path.insert(0, HERE)
    w, _h, rgba = read_png_rgba(path)
    cols = max(1, w // fw)
    out = []
    for i in range(count):
        fx, fy = (i % cols) * fw, (i // cols) * fh
        buf = bytearray()
        for y in range(fh):
            start = ((fy + y) * w + fx) * 4
            buf += rgba[start:start + fw * 4]
        out.append(buf)
    return out


def opaque_extent(frame, fw, fh):
    """(height, width) of the drawn pixels in one RGBA frame buffer.

    Height is measured from the frame's BOTTOM edge up to the topmost drawn row,
    not as the bounding box: `anchor: feet` puts the bottom edge on the ground
    contact line, so that is where a collider grows from. Alpha > 8 counts as
    drawn — a stray 1/255 pixel from a lossy round-trip is not a silhouette.
    """
    top, left, right = None, fw, -1
    for y in range(fh):
        row = frame[y * fw * 4:(y + 1) * fw * 4]
        for x in range(fw):
            if row[x * 4 + 3] > 8:
                if top is None:
                    top = y
                if x < left:
                    left = x
                if x > right:
                    right = x
    if top is None:
        return 0, 0
    return fh - top, right - left + 1


def check():
    errors = []
    warnings = []

    if not os.path.exists(REGISTRY):
        return ["missing %s" % rel(REGISTRY)], []
    if not os.path.exists(SPEC):
        return ["missing %s — the game has no declared asset spec" % rel(SPEC)], []

    reg = load_json(REGISTRY)
    spec = load_json(SPEC)
    sprites = reg.get("sprites", {})
    known_classes = set(spec.get("classes", {}))
    # Tilesets are deliberately absent: data/tilesets/tileset_manifest.json already
    # owns their contract (grid, per-tile roles, provenance). Everything it names is
    # claimed here so those PNGs do not read as orphans.
    tileset_claimed = set()
    if os.path.exists(TILESET_MANIFEST):
        for t in load_json(TILESET_MANIFEST).get("tilesets", []):
            tileset_claimed.add(t.get("image", ""))

    claimed = set()

    # --- 1 + 3: registry entries point at real files with a valid grid --------
    for key, raw in sprites.items():
        # Claim the path first: a sprite with a bad class is still a registered file,
        # and reporting it as an orphan too would just be noise on top of the real error.
        claimed.add(raw.get("path", ""))
        cls = raw.get("class", "")
        if cls not in known_classes:
            errors.append(
                "sprite '%s' has class %r — must be one of %s (see %s). The class is what "
                "gives it a frame size and anchor."
                % (key, cls, ", ".join(sorted(known_classes)) or "(none defined)", rel(SPEC))
            )
            continue
        e, overridden = resolve(raw, spec)
        if overridden and not str(raw.get("why", "")).strip():
            errors.append(
                "sprite '%s' overrides %s from class '%s' with no `why`. An asset may differ "
                "from the spec, but the reason has to be on the record."
                % (key, "/".join(overridden), cls)
            )
        if overridden:
            warnings.append(
                "sprite '%s' is off-spec for class '%s' (%s) — %s"
                % (key, cls, "/".join(overridden), str(raw.get("why", "")).strip())
            )
        relpath = e.get("path", "")
        abspath = os.path.join(ROOT, relpath)
        claimed.add(relpath)
        if not os.path.exists(abspath):
            # A slot flagged `optional` is art brand/ASSET_MANIFEST.md has commissioned
            # but nobody has drawn yet. The registry names it so the day the file lands
            # it is picked up with no code change; until then the caller falls back.
            if bool(raw.get("optional", False)):
                fb = str(raw.get("fallback", "")).strip()
                warnings.append(
                    "slot '%s' is still empty (%s)%s"
                    % (key, relpath, " — falling back to '%s'" % fb if fb else ""))
            else:
                errors.append("sprite '%s' -> missing file %s" % (key, relpath))
            continue
        size = png_size(abspath)
        if size is None:
            errors.append("sprite '%s' -> %s is not a PNG" % (key, relpath))
            continue
        w, h = size
        fw, fh = int(e.get("frameWidth", 0)), int(e.get("frameHeight", 0))
        if fw <= 0 or fh <= 0:
            errors.append("sprite '%s' has no frame size" % key)
            continue
        if w % fw or h % fh:
            errors.append(
                "sprite '%s' is class '%s', which requires %dx%d cells — the delivered PNG "
                "is %dx%d, which is not a whole number of them. Re-export at a multiple of "
                "%dx%d (see `check_assets.py --spec`), or override frameWidth/frameHeight "
                "on this sprite with a `why`."
                % (key, cls, fw, fh, w, h, fw, fh)
            )
            continue
        # The sheet must be a whole number of the class's cells in both axes.
        # This is where off-spec art is caught before anyone wonders why it looks wrong.
        cw, ch = int(e.get("frameWidth", 0)), int(e.get("frameHeight", 0))
        if not overridden and (w % cw or h % ch):
            errors.append(
                "sprite '%s' (class '%s', %dx%d cells) has a %dx%d sheet, which is not a "
                "whole number of cells. Re-export to a multiple of %dx%d, or override "
                "frameWidth/frameHeight on this sprite with a `why`."
                % (key, cls, cw, ch, w, h, cw, ch)
            )
        capacity = (w // fw) * (h // fh)
        declared = int(e.get("frames", 1))
        if declared > capacity:
            errors.append(
                "sprite '%s' declares %d frames, sheet %dx%d holds %d"
                % (key, declared, w, h, capacity)
            )
        elif declared < capacity:
            warnings.append(
                "sprite '%s' uses %d of %d cells — %d unused cell(s) shipping"
                % (key, declared, capacity, capacity - declared)
            )
        if declared > 1 and float(e.get("fps", 0)) <= 0:
            errors.append("sprite '%s' animates %d frames at fps %s" % (key, declared, e.get("fps")))
        fb = str(raw.get("fallback", "")).strip()
        if fb and fb not in sprites:
            errors.append("sprite '%s' falls back to '%s', which is not a registered sprite" % (key, fb))
        anchor = e.get("anchor")
        if anchor not in ("feet", "center"):
            errors.append(
                "sprite '%s' resolves to anchor %r via class '%s' — must be \"feet\" (frame "
                "bottom on the origin) or \"center\". Without it the entity cannot derive "
                "its offset and something will hardcode one." % (key, anchor, cls)
            )


    # --- 2: no orphaned images ------------------------------------------------
    for abspath in walk(ASSETS, {".png", ".jpg", ".jpeg", ".webp"}):
        r = rel(abspath)
        if r in claimed or r in tileset_claimed or r in ALLOW_UNREFERENCED:
            continue
        errors.append(
            "%s is not in sprite_registry.json — register it or delete it "
            "(export_filter is all_resources, so it ships either way)" % r
        )

    # --- 4: import sidecars + pixel-art preset --------------------------------
    for abspath in walk(ASSETS, {".png", ".jpg", ".jpeg", ".webp"}):
        imp = abspath + ".import"
        if not os.path.exists(imp):
            errors.append("%s has no .import sidecar (run: godot --headless --import)" % rel(abspath))
            continue
        params = parse_import(imp)
        for k, want in REQUIRED_IMPORT.items():
            got = params.get(k)
            if got is None:
                errors.append("%s: .import is missing %s" % (rel(abspath), k))
            elif got != want:
                errors.append(
                    "%s: .import %s=%s, pixel-art preset requires %s "
                    "(delete the .import and re-run godot --headless --import)"
                    % (rel(abspath), k, got, want)
                )

    for imp in walk(ASSETS, {".import"}):
        source = imp[: -len(".import")]
        if not os.path.exists(source):
            errors.append("%s is orphaned — its source file is gone" % rel(imp))

    # --- 5: no sprite paths hardcoded in .gd ----------------------------------
    for dirpath, _, files in os.walk(SCRIPTS):
        for fn in files:
            if not fn.endswith(".gd"):
                continue
            p = os.path.join(dirpath, fn)
            with open(p, encoding="utf-8") as f:
                for i, line in enumerate(f, 1):
                    if ALLOW_LINE in line or line.strip().startswith("#"):
                        continue
                    m = SPRITE_PATH_RE.search(line)
                    if m:
                        errors.append(
                            "%s:%d hardcodes %s — use a sprite_registry.json key "
                            "via SpriteSheet (rule 7)" % (rel(p), i, m.group(0))
                        )

    # --- 5b: no hardcoded sprite anchors in scenes ----------------------------
    if os.path.isdir(SCENES):
        for path in walk(SCENES, {".tscn"}):
            in_sprite = False
            with open(path, encoding="utf-8") as f:
                for i, line in enumerate(f, 1):
                    if line.startswith("[node "):
                        in_sprite = bool(SPRITE_NODE_RE.match(line))
                    elif in_sprite and line.startswith(("offset = ", "scale = ")):
                        errors.append(
                            "%s:%d hardcodes %s on a sprite node — anchors and scale come "
                            "from sprite_registry.json via SpriteSheet.anchor_offset, so "
                            "swapping art with a different frame size cannot silently "
                            "change what the number means"
                            % (rel(path), i, line.strip().split("=")[0].strip())
                        )

    # --- 7: frame integrity ---------------------------------------------------
    for key, raw in sprites.items():
        cls = raw.get("class", "")
        if cls not in known_classes:
            continue
        e, _ = resolve(raw, spec)
        abspath = os.path.join(ROOT, e.get("path", ""))
        n = int(e.get("frames", 1))
        fw, fh = int(e.get("frameWidth", 0)), int(e.get("frameHeight", 0))
        if n < 2 or fw <= 0 or fh <= 0 or not os.path.exists(abspath):
            continue
        try:
            frames = read_frames(abspath, fw, fh, n)
        except Exception as exc:                       # report, never crash the guard
            errors.append("sprite '%s': could not decode frames (%s)" % (key, exc))
            continue
        empty = [i for i, f in enumerate(frames) if not any(f[3::4])]
        if empty:
            errors.append(
                "sprite '%s' declares %d frames but frame(s) %s are fully transparent — "
                "the sheet holds fewer real frames than the registry claims, which plays "
                "as a gap in the animation." % (key, n, empty))
        seen, dupes = {}, []
        for i, f in enumerate(frames):
            h = bytes(f)
            if h in seen:
                dupes.append((seen[h], i))
            else:
                seen[h] = i
        if dupes:
            warnings.append(
                "sprite '%s' has identical frames %s — either the export duplicated them "
                "or the frame count is too high" % (key, dupes))

    # --- 5b: a declared collider fits inside the drawing ---------------------
    #
    # A class may declare `body`: the collision box, in frame pixels, grown up
    # from the frame's bottom edge. It is the collider the game builds at
    # runtime (SpriteSheet.body_box), and it has to be INSIDE the silhouette in
    # every frame — a box taller than the art is a character that collides with
    # a ceiling it has visibly not touched, which is exactly what shipped: 56px
    # of collider on a crow drawn 47.
    for key, raw in sorted(sprites.items()):
        cls = spec.get("classes", {}).get(raw.get("class", ""), {})
        body = cls.get("body")
        if not isinstance(body, dict):
            continue
        abspath = os.path.join(ROOT, raw.get("path", ""))
        if not raw.get("path") or not os.path.exists(abspath):
            continue
        fw = int(raw.get("frameWidth", cls.get("frameWidth", 0)))
        fh = int(raw.get("frameHeight", cls.get("frameHeight", 0)))
        if fw <= 0 or fh <= 0:
            continue
        try:
            frames = read_frames(abspath, fw, fh, int(raw.get("frames", 1)))
        except Exception as exc:                       # pragma: no cover
            errors.append("sprite '%s': could not measure for its body box (%s)" % (key, exc))
            continue
        for i, frame in enumerate(frames):
            drawn_h, drawn_w = opaque_extent(frame, fw, fh)
            if drawn_h == 0:
                continue
            if int(body.get("height", 0)) > drawn_h:
                errors.append(
                    "sprite '%s' frame %d is drawn %dpx tall, but its class declares a "
                    "%dpx body box — the collider sticks out of the top of the art, so the "
                    "character stops short of every ceiling it jumps at."
                    % (key, i, drawn_h, int(body["height"])))
            if int(body.get("width", 0)) > drawn_w:
                errors.append(
                    "sprite '%s' frame %d is drawn %dpx wide, but its class declares a "
                    "%dpx body box — the collider is wider than the character."
                    % (key, i, drawn_w, int(body["width"])))

    # --- 6: audio is manifest-claimed ----------------------------------------
    if os.path.exists(AUDIO_MANIFEST):
        manifest_text = json.dumps(load_json(AUDIO_MANIFEST))
        for abspath in walk(os.path.join(ASSETS, "audio"), {".mp3", ".wav", ".ogg"}):
            if os.path.basename(abspath) not in manifest_text:
                warnings.append("%s is not named by audio_manifest.json" % rel(abspath))

    return errors, warnings


def selftest():
    """Prove the grid maths rejects what it should, without touching the repo."""
    cases = [
        # (sheet_w, sheet_h, frame_w, frame_h, frames, should_pass)
        (96, 96, 32, 32, 9, True),
        (192, 192, 64, 64, 9, True),
        (528, 576, 88, 96, 36, True),
        (100, 96, 32, 32, 9, False),   # width not divisible
        (96, 96, 32, 32, 10, False),   # more frames than cells
    ]
    bad = 0
    for w, h, fw, fh, n, ok in cases:
        divides = (w % fw == 0) and (h % fh == 0)
        fits = divides and n <= (w // fw) * (h // fh)
        if fits != ok:
            print("  selftest FAIL: %dx%d @ %dx%d x%d -> %s, expected %s" % (w, h, fw, fh, n, fits, ok))
            bad += 1
    if bad:
        return 1
    print("check_assets selftest: %d/%d grid cases OK" % (len(cases), len(cases)))

    # And prove the body-box measurement measures what it claims. The whole
    # point of it is that a 64px frame is not a 64px character: build a frame
    # with a known amount of clear margin above the head and check the number
    # that comes back is the drawing, not the frame.
    fw = fh = 8
    body_cases = [
        # (top_pad, left_pad, right_pad, expected_h, expected_w)
        (0, 0, 0, 8, 8),      # fills the frame
        (3, 0, 0, 5, 8),      # 3px of sky above the head — the shipped case
        (8, 0, 0, 0, 0),      # nothing drawn at all
        (2, 2, 1, 6, 5),      # inset on three sides
    ]
    for top, left, right, want_h, want_w in body_cases:
        frame = bytearray(fw * fh * 4)
        for y in range(top, fh):
            for x in range(left, fw - right):
                frame[(y * fw + x) * 4 + 3] = 255
        got_h, got_w = opaque_extent(frame, fw, fh)
        if (got_h, got_w) != (want_h, want_w):
            print("  selftest FAIL: pad(t%d l%d r%d) -> %dx%d, expected %dx%d"
                  % (top, left, right, got_w, got_h, want_w, want_h))
            bad += 1
    if bad:
        return 1
    print("check_assets selftest: %d/%d body-box cases OK" % (len(body_cases), len(body_cases)))
    return 0


def print_spec():
    """The delivery brief: what the game requires, per kind of art."""
    spec = load_json(SPEC)
    reg = load_json(REGISTRY) if os.path.exists(REGISTRY) else {"sprites": {}}
    sprites = reg.get("sprites", {})

    grid = spec.get("grid", {})
    print("CROW — ASSET SPECIFICATION")
    print("=" * 74)
    print("World grid: %dpx tile. %s" % (grid.get("tile", 0), grid.get("note", "")))
    print()

    for cls, c in spec.get("classes", {}).items():
        members = sorted(k for k, v in sprites.items() if v.get("class") == cls)
        print("%s  —  %dx%d px, anchor: %s" % (
            cls.upper(), c.get("frameWidth", 0), c.get("frameHeight", 0), c.get("anchor", "?")))
        print("  %s" % c.get("description", ""))
        for n in c.get("art_notes", []):
            print("    - %s" % n)
        if members:
            print("  current assets:")
            for k in members:
                raw = sprites[k]
                over = [o for o in OVERRIDABLE if o in raw]
                fw = raw.get("frameWidth", c.get("frameWidth", 0))
                fh = raw.get("frameHeight", c.get("frameHeight", 0))
                n = int(raw.get("frames", 1))
                shape = "%dx%d" % (fw, fh)
                if n > 1:
                    shape += " x%d frames @ %sfps" % (n, raw.get("fps", 0))
                flag = "   OFF-SPEC: %s" % str(raw.get("why", "")).strip() if over else ""
                print("    %-12s %s%s" % (k, shape, flag))
        else:
            print("  current assets: (none yet)")
        print()

    ts = spec.get("tilesets", {})
    print("TILESET  —  %dx%d px tiles" % (ts.get("tileWidth", 0), ts.get("tileHeight", 0)))
    print("  %s" % ts.get("description", ""))
    for n in ts.get("art_notes", []):
        print("    - %s" % n)
    print()
    print("-" * 74)
    print("Anchor: \"feet\" = the BOTTOM edge of the frame is the ground contact line.")
    print("        \"center\" = the frame is centred on the object's position.")
    print()
    print("Rendering: 960x540 canvas, Nearest filtering, whole-number scaling only.")
    print("           Art is drawn at exactly the size you export it. Nothing is resized.")
    print()
    print("To change a standard for every asset of a kind, edit %s." % rel(SPEC))
    print("To deviate for one asset, put frameWidth/frameHeight/anchor on it in")
    print("%s with a `why`." % rel(REGISTRY))
    return 0


def main():
    if "--selftest" in sys.argv:
        return selftest()
    if "--spec" in sys.argv:
        return print_spec()
    errors, warnings = check()
    for w in warnings:
        print("  warn: %s" % w)
    if errors:
        print("\nAsset guard failed (%d):" % len(errors))
        for e in errors:
            print("  - %s" % e)
        return 1
    print("check_assets: OK (%d warning(s))" % len(warnings))
    return 0


if __name__ == "__main__":
    sys.exit(main())
