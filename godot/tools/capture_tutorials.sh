#!/usr/bin/env bash
# Render every maths lesson card to a PNG contact sheet, for a UI/UX pass.
#
# The lessons are drawn in code from data/tuning/tutorial_tuning.json, so a
# layout, spacing or palette change lands on 120 cards at once and the only
# honest review is to look at them.
#
# Usage:
#   bash godot/tools/capture_tutorials.sh                        # all lessons, English
#   bash godot/tools/capture_tutorials.sh --locale=is            # all lessons, Icelandic
#   bash godot/tools/capture_tutorials.sh --theme=sugarstorm
#   bash godot/tools/capture_tutorials.sh addition.make_ten      # just one
#
# Output: output/tutorial-captures/<locale>__<lesson>__<n>_<card>.png
#
# Needs a display. On a headless machine this wraps itself in xvfb-run, because
# --headless uses the dummy renderer and every capture comes out blank.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # godot/
ROOT="$(cd "$HERE/.." && pwd)"
GODOT="${GODOT:-godot}"
OUT="$ROOT/output/tutorial-captures"

mkdir -p "$OUT"
RUN=("$GODOT" --path "$HERE" --resolution 960x540 --rendering-driver opengl3 \
	res://tests/integration/TutorialCapture.tscn -- "--out=$OUT" "$@")

if [ -n "${DISPLAY:-}" ]; then
	"${RUN[@]}"
elif command -v xvfb-run >/dev/null 2>&1; then
	xvfb-run -a "${RUN[@]}"
else
	echo "No DISPLAY and no xvfb-run. Godot cannot render offscreen without one," >&2
	echo "and --headless would write blank PNGs." >&2
	exit 1
fi
