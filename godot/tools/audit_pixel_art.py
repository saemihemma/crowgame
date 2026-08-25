#!/usr/bin/env python3
"""Pixel-art audit — measures how far each live sprite is from being real pixel
art, and renders proof at the scale players actually see.

Why this exists: the game renders at 960x540 with Nearest filtering and integer
upscaling, so nothing softens the source art on its way to the screen. Soft
anti-aliased edges, stray near-invisible pixels and silhouettes cropped flush
against their own frame all survive magnification intact — that is the
"muddy silhouette" PRODUCT.md rules out. The numbers say which assets carry it;
`--crops` renders the same frames at 1x/2x/4x Nearest so you can judge by eye
rather than by metric. Read both: a high colour count alone is dithering or
anti-aliasing, not proof that art was upscaled — `native` is what settles that.

Metrics per sprite:
  colors        distinct RGB among non-transparent pixels. A tight hand-picked
                palette lands in the tens; heavy anti-aliasing or dithering
                pushes it into the thousands. High on its own is a smell, not a
                verdict — check `native` and the crops before concluding.
  soft%         share of visible pixels with partial alpha. Real pixel art is
                near-binary alpha; a soft edge is a blur halo.
  ghost         pixels with alpha 1..7 — invisible in play, but they widen the
                measured silhouette and confuse grounding/bbox work.
  clip          frame edges the artwork touches. A silhouette flush against its
                own frame has been cropped, and cannot be repositioned or given
                a contact shadow without an export change.
  margin        free pixels on each side of the tightest bounding box, min
                across frames.
  bboxJitter    how much the bounding box wanders across frames. High values on
                a walk cycle mean the animation is not registered to a common
                origin, so the character visually swims.
  native        the art's own pixel size in file pixels. 1 means the sprite was
                authored at 1:1 and every file pixel is a real art pixel; 2+
                means it was drawn small and upscaled, so its apparent grid is
                coarser than its neighbours' and it will not match them on
                screen. A mixed-native set is an art-direction inconsistency
                no import setting can fix.

Usage:
  python3 godot/tools/audit_pixel_art.py                # table
  python3 godot/tools/audit_pixel_art.py --json out.json
  python3 godot/tools/audit_pixel_art.py --crops DIR    # PNG proof at 1x/2x/4x

Requires Pillow only for --crops; the table works without it.
"""
import argparse
import json
import os
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
REGISTRY = os.path.join(ROOT, "data", "registries", "sprite_registry.json")

GHOST_ALPHA = 8          # alpha below this is invisible in play but still "there"
SOFT_PCT_BUDGET = 5.0    # % of visible pixels allowed to be partially transparent
COLOR_BUDGET = 64        # distinct RGB per sprite before it stops reading as pixel art


# --- minimal PNG reader (no Pillow, so this runs in CI) ---------------------

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

def frame_metrics(rgba, w, fx, fy, fw, fh):
    colors, visible, soft, ghost = set(), 0, 0, 0
    minx, miny, maxx, maxy = fw, fh, -1, -1
    for y in range(fh):
        row = (fy + y) * w
        for x in range(fw):
            i = (row + fx + x) * 4
            a = rgba[i + 3]
            if a == 0:
                continue
            if a < GHOST_ALPHA:
                ghost += 1
                continue
            visible += 1
            if a < 255:
                soft += 1
            colors.add(rgba[i] << 16 | rgba[i + 1] << 8 | rgba[i + 2])
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
    if maxx < 0:
        return dict(colors=colors, visible=0, soft=0, ghost=ghost, bbox=None)
    return dict(colors=colors, visible=visible, soft=soft, ghost=ghost,
                bbox=(minx, miny, maxx, maxy))


def native_block(rgba, w, fw, fh, threshold=0.90):
    """Largest N for which frame 0 is (mostly) made of uniform NxN blocks — the
    art's own pixel size. 1 = authored at 1:1; 2+ = drawn smaller and upscaled."""
    def uniform_fraction(n):
        if fw % n or fh % n:
            return 0.0
        uni = total = 0
        for by in range(fh // n):
            for bx in range(fw // n):
                total += 1
                base = None
                same = True
                for y in range(n):
                    row = (by * n + y) * w
                    for x in range(n):
                        i = (row + bx * n + x) * 4
                        px = bytes(rgba[i:i + 4])
                        if base is None:
                            base = px
                        elif px != base:
                            same = False
                            break
                    if not same:
                        break
                if same:
                    uni += 1
        return uni / total if total else 0.0

    best = 1
    for n in (2, 3, 4, 6, 8):
        if uniform_fraction(n) >= threshold:
            best = n
    return best


def audit_sprite(key, entry):
    path = os.path.join(ROOT, entry["path"])
    w, h, rgba = read_png_rgba(path)
    fw, fh = int(entry["frameWidth"]), int(entry["frameHeight"])
    n = int(entry.get("frames", 1))
    cols = max(1, w // fw)

    allc, visible, soft, ghost = set(), 0, 0, 0
    boxes = []
    for i in range(n):
        m = frame_metrics(rgba, w, (i % cols) * fw, (i // cols) * fh, fw, fh)
        allc |= m["colors"]
        visible += m["visible"]
        soft += m["soft"]
        ghost += m["ghost"]
        if m["bbox"]:
            boxes.append(m["bbox"])

    clipped, margins, jitter = [], None, None
    if boxes:
        left = min(b[0] for b in boxes)
        top = min(b[1] for b in boxes)
        right = min(fw - 1 - b[2] for b in boxes)
        bottom = min(fh - 1 - b[3] for b in boxes)
        margins = dict(left=left, top=top, right=right, bottom=bottom)
        clipped = [side for side, v in
                   (("L", left), ("T", top), ("R", right), ("B", bottom)) if v == 0]
        jitter = dict(
            x=max(b[0] for b in boxes) - min(b[0] for b in boxes),
            y=max(b[1] for b in boxes) - min(b[1] for b in boxes),
            w=max(b[2] - b[0] for b in boxes) - min(b[2] - b[0] for b in boxes),
            h=max(b[3] - b[1] for b in boxes) - min(b[3] - b[1] for b in boxes),
        )

    soft_pct = (100.0 * soft / visible) if visible else 0.0
    verdict = []
    if len(allc) > COLOR_BUDGET:
        verdict.append("palette")
    if soft_pct > SOFT_PCT_BUDGET:
        verdict.append("soft-edges")
    if ghost:
        verdict.append("ghost-px")
    if clipped:
        verdict.append("clipped-" + "".join(clipped))

    native = native_block(rgba, w, fw, fh)
    if native > 1:
        verdict.append("upscaled-%dx" % native)

    return dict(
        key=key, path=entry["path"], sheet=[w, h], frame=[fw, fh], frames=n,
        bytes=os.path.getsize(path), colors=len(allc), visible=visible,
        soft=soft, soft_pct=round(soft_pct, 1), ghost=ghost, native=native,
        margins=margins, clipped=clipped, jitter=jitter,
        verdict=verdict or ["clean"],
    )


# --- crop rendering (Pillow, optional) --------------------------------------

def write_crops(results, outdir):
    try:
        from PIL import Image
    except ImportError:
        print("  (--crops needs Pillow: pip install Pillow)", file=sys.stderr)
        return 0
    os.makedirs(outdir, exist_ok=True)
    written = 0
    for r in results:
        im = Image.open(os.path.join(ROOT, r["path"])).convert("RGBA")
        fw, fh = r["frame"]
        cols = max(1, im.size[0] // fw)
        frame0 = im.crop((0, 0, fw, fh))
        # 1x / 2x (the real desktop presentation) / 4x (edge inspection),
        # all Nearest so what you see is what the GPU does.
        strip_w = fw + fw * 2 + fw * 4 + 24
        strip = Image.new("RGBA", (strip_w, fh * 4), (30, 30, 34, 255))
        x = 0
        for scale in (1, 2, 4):
            s = frame0.resize((fw * scale, fh * scale), Image.NEAREST)
            strip.alpha_composite(s, (x, 0))
            x += fw * scale + 12
        strip.save(os.path.join(outdir, "%s_scales.png" % r["key"]))
        written += 1
        if r["frames"] > 1:
            sheet = Image.new("RGBA", (fw * 2 * r["frames"], fh * 2), (30, 30, 34, 255))
            for i in range(r["frames"]):
                fx, fy = (i % cols) * fw, (i // cols) * fh
                f = im.crop((fx, fy, fx + fw, fy + fh)).resize((fw * 2, fh * 2), Image.NEAREST)
                sheet.alpha_composite(f, (i * fw * 2, 0))
            sheet.save(os.path.join(outdir, "%s_frames_2x.png" % r["key"]))
            written += 1
    return written


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", metavar="FILE", help="write the full report as JSON")
    ap.add_argument("--crops", metavar="DIR", help="render Nearest 1x/2x/4x proof PNGs")
    args = ap.parse_args()

    with open(REGISTRY, encoding="utf-8") as f:
        reg = json.load(f)

    spec_path = os.path.join(ROOT, "data", "registries", "sprite_spec.json")
    with open(spec_path, encoding="utf-8") as f:
        classes = json.load(f).get("classes", {})

    results = []
    for key, raw in reg.get("sprites", {}).items():
        e = dict(classes.get(raw.get("class", ""), {}))
        e.update(raw)
        if not os.path.exists(os.path.join(ROOT, e.get("path", ""))):
            continue          # an optional slot whose art has not landed yet
        results.append(audit_sprite(key, e))

    print("%-11s %-9s %5s %7s %6s %6s %6s %-14s %s" %
          ("sprite", "sheet", "fr", "colors", "soft%", "ghost", "native", "margin L/T/R/B", "verdict"))
    print("-" * 96)
    for r in sorted(results, key=lambda r: -r["colors"]):
        m = r["margins"] or {}
        margin = "%s/%s/%s/%s" % (m.get("left", "-"), m.get("top", "-"),
                                  m.get("right", "-"), m.get("bottom", "-"))
        print("%-11s %-9s %5d %7d %6.1f %6d %5dx %-14s %s" % (
            r["key"], "%dx%d" % tuple(r["sheet"]), r["frames"], r["colors"],
            r["soft_pct"], r["ghost"], r["native"], margin, ",".join(r["verdict"])))

    print("\nbudgets: colors <= %d, soft%% <= %.1f, ghost == 0, native == 1x, no clipped edge"
          % (COLOR_BUDGET, SOFT_PCT_BUDGET))
    jit = [r for r in results if r["frames"] > 1 and r["jitter"]]
    if jit:
        print("\nframe registration (multi-frame sheets):")
        for r in jit:
            j = r["jitter"]
            print("  %-11s bbox drift x=%d y=%d  size drift w=%d h=%d"
                  % (r["key"], j["x"], j["y"], j["w"], j["h"]))

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump({"sprites": results}, f, indent=2)
        print("\nwrote %s" % args.json)
    if args.crops:
        n = write_crops(results, args.crops)
        print("wrote %d crop image(s) to %s" % (n, args.crops))
    return 0


if __name__ == "__main__":
    sys.exit(main())
