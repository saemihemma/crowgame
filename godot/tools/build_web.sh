#!/usr/bin/env bash
# Build the mobile-playable Web (HTML5) export of the Crow Godot port.
# Output: output/web/ (single-threaded build — serves from any static host,
# no COOP/COEP headers required, works in mobile browsers).
#
# Usage: bash godot/tools/build_web.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"      # godot/
ROOT="$(cd "$HERE/.." && pwd)"                               # repo root
GODOT="${GODOT:-godot}"
OUT="$ROOT/output/web"

mkdir -p "$OUT"

# Bake a build stamp shown in the MainMenu corner so phone refreshes are
# visibly confirmed during fast iteration.
#
# CROW_BUILD_COMMIT lets CI stamp the commit actually being built. Locally we
# fall back to HEAD, which is the *parent* of the commit that will carry this
# build — so a local build's stamp is off by one until it is committed. CI is
# the source of truth for a deployed stamp.
COMMIT="${CROW_BUILD_COMMIT:-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo dev)}"
printf '{"builtAt":"%s","commit":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%MZ)" "$COMMIT" > "$HERE/build_info.json"

"$GODOT" --headless --path "$HERE" --import >/dev/null 2>&1 || true
"$GODOT" --headless --path "$HERE" --export-release "Web" "$OUT/index.html"

# ── content-addressed payload ────────────────────────────────────────────────
#
# Godot exports fixed filenames (index.wasm, index.pck), which forces the cache
# policy to be "revalidate every launch": the browser has to ask whether the file
# it holds is still current, because the name alone cannot say. Stamping a
# content hash into the names removes that question, so the payload can be served
# `immutable` and a returning player transfers ZERO bytes for it.
#
# One id derived from both files rather than a hash per file, because Godot's
# loader builds every path from a single `executable` name: it asks for
# <executable>.wasm, <executable>.pck and <executable>.audio.worklet.js. One id
# keeps that contract intact.
stamp_build_id() {
	local id
	id="$(cat "$OUT/index.wasm" "$OUT/index.pck" | sha256sum | cut -c1-12)"
	echo "content id: $id"

	for ext in wasm pck js audio.worklet.js; do
		[ -f "$OUT/index.$ext" ] || continue
		mv "$OUT/index.$ext" "$OUT/index.$id.$ext"
	done

	# Rewrite the shell: the engine config's `executable`, the fileSizes keys it
	# checks against, and the <script src> that bootstraps it.
	python3 - "$OUT/index.html" "$id" <<'REWRITE'
import re, sys
path, build_id = sys.argv[1], sys.argv[2]
html = open(path).read()
html = html.replace('"executable":"index"', f'"executable":"index.{build_id}"')
html = re.sub(r'"index\.(pck|wasm)"', lambda m: f'"index.{build_id}.{m.group(1)}"', html)
html = html.replace('src="index.js"', f'src="index.{build_id}.js"')
open(path, 'w').write(html)
REWRITE

	# index.html itself must never be cached: it is the only thing that knows
	# which hashed payload belongs to this build.
	printf '%s\n' "$id" > "$OUT/build_id.txt"
}

# The <head> scripts are not Godot resources, so the export does not emit them.
# Copy them in beside the shell that references them.
stamp_build_id

cp "$ROOT/deploy/web/crow-errors.js" "$OUT/crow-errors.js"
cp "$ROOT/deploy/web/crow-focus.js" "$OUT/crow-focus.js"
cp "$ROOT/deploy/web/crow-fullscreen.js" "$OUT/crow-fullscreen.js"
cp "$ROOT/deploy/web/manifest.webmanifest" "$OUT/manifest.webmanifest"

# LANDSCAPE ONLY, said out loud.
#
# The game is landscape (project.godot orientation=0) and portrait is not
# supported: a level fills the top 45% of a tall viewport and leaves a black band
# under it, because the parallax horizon is a fraction of the SCREEN tuned on
# 16:9. Rather than half-support it, the game says so.
#
# THIS OVERLAY DID NOT SHIP FOR THE WHOLE LIFE OF THE FEATURE, and the reason is
# worth keeping. The guard asked whether the string 'crow-rotate' appeared
# anywhere in index.html -- and it always does, because the CSS that styles the
# overlay is part of html/head_include and the Godot export writes that in before
# this script runs. So the stylesheet shipped in every build and the element it
# styled shipped in none of them. The guard now looks for the ELEMENT, and
# web_boot_smoke.mjs gate B5 fails the build if it is missing or if it is not
# showing at a portrait viewport, so it cannot go quiet again.
#
# In the <head>, not in the engine: a child who opens the game holding the tablet
# upright has to be told before the wasm has finished loading, and this is the
# only layer that exists that early. Both languages for the same reason -- the
# locale lives in IndexedDB and reading it here would mean an async hop before
# the one message that must never be late. The icon carries it for a five-year-old
# who cannot read either line.
python3 - "$OUT/index.html" <<'ROTATE'
import sys
path = sys.argv[1]
html = open(path).read()
# The ELEMENT, not the string: see above.
if 'id="crow-rotate"' not in html:
    overlay = (
        '<div id="crow-rotate" aria-hidden="true">'
        '<svg viewBox="0 0 100 100" fill="none" stroke="#FDF6E3" stroke-width="5" '
        'stroke-linecap="round" stroke-linejoin="round">'
        # A tablet, stood upright, with an arrow curving it onto its side.
        '<rect x="34" y="14" width="32" height="52" rx="5"/>'
        '<line x1="43" y1="60" x2="57" y2="60"/>'
        '<path d="M22 74a34 34 0 0 0 56 0"/>'
        '<polyline points="22 62 22 75 35 75"/>'
        '<polyline points="78 62 78 75 65 75"/>'
        '</svg>'
        '<p>Snúðu spjaldtölvunni á hliðina</p>'
        '<p class="crow-rotate-sub">Turn your tablet sideways to play</p>'
        # A rotation lock makes the line above impossible to follow, and a child
        # handed a locked tablet has no way to know that is what is wrong. Said
        # quietly, under the instruction, rather than instead of it.
        '<p class="crow-rotate-hint">Ef skjárinn snýst ekki: taktu snúningslásinn af.'
        '<br>If the screen will not turn, switch off rotation lock.</p>'
        '</div>'
    )
    html = html.replace('<body>', '<body>' + overlay, 1)
    open(path, 'w').write(html)
ROTATE

# build_info.json is inside the pck for main_menu.gd, but crow-errors.js fetches
# it over HTTP to tag reports with the build, so it also needs to sit next to
# index.html.
cp "$HERE/build_info.json" "$OUT/build_info.json"

# NOTE: the payload is NOT precompressed here. Caddy serves precompressed
# .gz files when they exist (deploy/web/Caddyfile -> file_server precompressed),
# and those are generated inside the Docker image build instead. Committing ~23 MB
# of .gz alongside the ~53 MB payload would double what every clone carries, for
# bytes that the image can regenerate in a second.

# Remove any payload from a previous build id: they are immutable and would
# otherwise accumulate in the deployed image forever.
find "$OUT" -maxdepth 1 -name 'index.*.wasm' -o -maxdepth 1 -name 'index.*.pck' \
	-o -maxdepth 1 -name 'index.*.js' | while read -r stale; do
	case "$stale" in *"$(cat "$OUT/build_id.txt" 2>/dev/null)"*) ;; *) rm -f "$stale" ;; esac
done

# Record what this export was built FROM. `npm run validate` and the godot CI job
# recompute the same hash and fail if the committed export no longer matches
# godot/**. Content addressing already busts caches; it does NOT catch staleness,
# because an export built from old sources still gets a perfectly valid
# content-addressed name. output/web is what Railway serves and it drifted a whole
# feature behind once. See tools/godot_export_fingerprint.mjs for why a hash and
# not a timestamp.
node "$ROOT/tools/write_export_fingerprint.mjs" "$ROOT"

echo "Web build written to $OUT/"
echo "Play locally:  (cd $OUT && python3 -m http.server 8060)  then open http://<this-machine-ip>:8060"
