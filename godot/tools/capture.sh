#!/usr/bin/env bash
# Capture every level from the Godot build. The visual half of the
# concept-then-measure loop in brand/PRODUCTION_PLAN.md.
#
#   bash godot/tools/capture.sh                        # every level, playing
#   bash godot/tools/capture.sh level_01               # just one
#   bash godot/tools/capture.sh level_01 play,math     # and its maths board
#
# Variants: play | math | math-wrong (see tools/capture/capture.gd).
# Writes output/godot-shots/<level>-<variant>.png.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GODOT="${GODOT:-godot}"
LEVELS="${1:-}"
VARIANTS="${2:-play}"

xvfb-run -a --server-args="-screen 0 1280x800x24" \
  "$GODOT" --path "$HERE" res://tools/capture/Capture.tscn -- "$LEVELS" "$VARIANTS" 2>&1 \
  | grep -E "^\[capture\]" || true
