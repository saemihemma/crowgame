#!/usr/bin/env bash
# Capture every level from the Godot build. The visual half of the
# concept-then-measure loop in brand/PRODUCTION_PLAN.md.
#
#   bash godot/tools/capture.sh                        # every level, playing
#   bash godot/tools/capture.sh level_01               # just one
#   bash godot/tools/capture.sh level_01 play,math     # and its maths board
#   bash godot/tools/capture.sh level_01 play "" 1194x834   # at iPad size
#
# Variants: play | math | math-wrong (see tools/capture/capture.gd).
# Writes output/godot-shots/<level>-<variant>.png.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GODOT="${GODOT:-godot}"
LEVELS="${1:-}"
VARIANTS="${2:-play}"
# Window size to photograph at, e.g. 1194x834 (iPad 11" landscape). Empty keeps
# the project default.
SIZE="${3:-}"

# --resolution, not DisplayServer.window_set_size: the window has to exist at
# the right size before the first frame, or the stretch system resolves the
# viewport against the default and the shot silently reports no letterbox.
RES_ARG=()
SCREEN="1600x1200"
if [ -n "$SIZE" ]; then
  RES_ARG=(--resolution "$SIZE")
fi

xvfb-run -a --server-args="-screen 0 ${SCREEN}x24" \
  "$GODOT" --path "$HERE" "${RES_ARG[@]}" res://tools/capture/Capture.tscn -- "$LEVELS" "$VARIANTS" "$SIZE" 2>&1 \
  | grep -E "^\[capture\]" || true
