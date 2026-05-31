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

mkdir -p "$ROOT/output/web"
"$GODOT" --headless --path "$HERE" --import >/dev/null 2>&1 || true
"$GODOT" --headless --path "$HERE" --export-release "Web" "$ROOT/output/web/index.html"
echo "Web build written to $ROOT/output/web/"
echo "Play locally:  (cd $ROOT/output/web && python3 -m http.server 8060)  then open http://<this-machine-ip>:8060 on your phone"
