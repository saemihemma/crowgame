#!/usr/bin/env bash
# Run the headless GDScript test suite for the Crow Godot port.
# Always (re)imports first so newly added `class_name` scripts register before
# the runner loads them, then runs the SceneTree test runner.
#
# Usage: bash godot/tools/run_tests.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GODOT="${GODOT:-godot}"

# Hermetic probes.
#
# user://crow_localstorage.json persists between runs, and the AUTOLOADS hydrate
# from it before any test scene's _ready() runs — so a probe cannot isolate
# itself from inside the scene tree. Isolation has to happen before the process
# starts, which means deleting the store here.
#
# Without this, probes inherited each other's state across runs: coin counts
# climbed (6->7, then 11->12, then 21->22) and owl_probe's asserted ELO drifted
# (152.99, 152.63, 152.95, 152.72). Every assertion still passed, because they
# were all directional — which is precisely the kind of test that stops catching
# regressions without ever going red.
USER_DATA="${XDG_DATA_HOME:-$HOME/.local/share}/godot/app_userdata/Crow"
reset_store() {
	rm -f "$USER_DATA/crow_localstorage.json"
}

# NOTE: deliberately NOT `set -e`. With it, the script aborted at the first
# failing command, every `x_status=$?` below was always 0, and the exit
# accumulation on the last line was dead code — so a contributor only ever saw
# the first broken probe and had to re-run to find the next. Now every stage
# runs, every failure is reported, and the accumulated status is real.

# Hardcode guard first — fail fast on inline colors / untranslated UI strings.
echo "=== hardcode guard ==="
python3 "$HERE/tools/check_hardcoding.py" --selftest
python3 "$HERE/tools/check_hardcoding.py"
guard_status=$?

"$GODOT" --headless --path "$HERE" --import >/dev/null 2>&1 || true
reset_store
"$GODOT" --headless --path "$HERE" res://tests/TestRunner.tscn
unit_status=$?

# Headless physics integration probes (separate scenes; advance real frames).
echo "=== integration probes ==="
reset_store
"$GODOT" --headless --path "$HERE" res://tests/integration/LandProbe.tscn
land_status=$?
reset_store
"$GODOT" --headless --path "$HERE" res://tests/integration/CoinProbe.tscn
coin_status=$?
reset_store
"$GODOT" --headless --path "$HERE" res://tests/integration/OwlProbe.tscn
owl_status=$?
reset_store
"$GODOT" --headless --path "$HERE" res://tests/integration/ShootProbe.tscn
shoot_status=$?
reset_store
"$GODOT" --headless --path "$HERE" res://tests/integration/DeathProbe.tscn
death_status=$?
reset_store
"$GODOT" --headless --path "$HERE" res://tests/integration/PerfProbe.tscn
perf_status=$?

exit $(( guard_status != 0 || unit_status != 0 || land_status != 0 || coin_status != 0 || owl_status != 0 || shoot_status != 0 || death_status != 0 || perf_status != 0 ))
