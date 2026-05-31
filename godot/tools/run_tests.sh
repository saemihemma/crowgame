#!/usr/bin/env bash
# Run the headless GDScript test suite for the Crow Godot port.
# Always (re)imports first so newly added `class_name` scripts register before
# the runner loads them, then runs the SceneTree test runner.
#
# Usage: bash godot/tools/run_tests.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GODOT="${GODOT:-godot}"

"$GODOT" --headless --path "$HERE" --import >/dev/null 2>&1 || true
"$GODOT" --headless --path "$HERE" res://tests/TestRunner.tscn
