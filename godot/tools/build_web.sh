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

# NOTE: the payload is NOT precompressed here. Caddy serves precompressed
# .gz files when they exist (deploy/web/Caddyfile -> file_server precompressed),
# and those are generated inside the Docker image build instead. Committing ~23 MB
# of .gz alongside the ~53 MB payload would double what every clone carries, for
# bytes that the image can regenerate in a second.

echo "Web build written to $OUT/"
echo "Play locally:  (cd $OUT && python3 -m http.server 8060)  then open http://<this-machine-ip>:8060"
