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
unit_status=$?

# Headless physics integration probes (separate scenes; advance real frames).
echo "=== integration probes ==="
"$GODOT" --headless --path "$HERE" res://tests/integration/LandProbe.tscn
land_status=$?
"$GODOT" --headless --path "$HERE" res://tests/integration/CoinProbe.tscn
coin_status=$?
"$GODOT" --headless --path "$HERE" res://tests/integration/OwlProbe.tscn
owl_status=$?
"$GODOT" --headless --path "$HERE" res://tests/integration/ShootProbe.tscn
shoot_status=$?

exit $(( unit_status != 0 || land_status != 0 || coin_status != 0 || owl_status != 0 || shoot_status != 0 ))
