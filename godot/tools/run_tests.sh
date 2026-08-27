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
# The directory is named after application/config/name, so DERIVE it rather than
# hardcoding: when the project was renamed Crow -> Hörmann, this path still said
# "Crow", reset_store silently deleted a file that did not exist, and the probes
# quietly stopped being hermetic again (coin counts 5->6 across runs). A rename
# must not be able to disable isolation.
APP_NAME="$(sed -n 's/^config\/name="\(.*\)"$/\1/p' "$HERE/project.godot" | head -1)"
if [ -z "$APP_NAME" ]; then
	echo "FATAL: could not read application/config/name from $HERE/project.godot;" >&2
	echo "       refusing to run non-hermetic probes against an unknown user dir." >&2
	exit 1
fi
USER_DATA="${XDG_DATA_HOME:-$HOME/.local/share}/godot/app_userdata/$APP_NAME"
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

# Asset guard — the sprite contract: registry/spec drift, orphaned art, import
# settings, and res:// literals creeping back into .gd.
echo "=== asset guard ==="
python3 "$HERE/tools/check_assets.py" --selftest
python3 "$HERE/tools/check_assets.py"
asset_status=$?

# Level reachability: every door and every coin has to be reachable from the
# spawn, using the crow's real movement envelope. Cheap, deterministic, and it
# found three unfinishable levels and twelve unobtainable coins the first time
# it ran.
echo "=== level reachability ==="
python3 "$HERE/tools/check_level_reachability.py"
reach_status=$?

"$GODOT" --headless --path "$HERE" --import >/dev/null 2>&1 || true
reset_store
# Teed, not just streamed: a GDScript runtime error is printed by the ENGINE and
# is not a test failure, so the suite reported 245 passed / 0 failed while
# "Nonexistent function 'get_effective_selection_elo'" fired 46 times and every
# problem selection was aiming at null. The assertions could not see it; the log
# could. So the log is now part of the result.
# Run one Godot scene and return non-zero if it FAILED OR printed a runtime error.
#
# The second half is the point. A GDScript runtime error is printed by the ENGINE
# and is not a test failure, and that is exactly how the lane system stayed dead
# for four commits: "Nonexistent function 'get_effective_selection_elo'" printed
# inside the owl probe's own stdout, three lines above its [pass] line, while the
# suite reported 236 passed / 0 failed. Every problem a child was served came out
# of the random fallback. An assertion about the outcome cannot tell a selector
# from its corpse -- but the log could, so the log is now part of the result.
run_scene() {
	local scene="$1"
	local log
	log="$(mktemp)"
	"$GODOT" --headless --path "$HERE" "$scene" 2>&1 | tee "$log"
	local status=${PIPESTATUS[0]}
	if grep -q "SCRIPT ERROR" "$log"; then
		echo "=== runtime error in $scene ==="
		echo "A live code path failed silently: a call into nothing returns null"
		echo "and the caller carries on. Fix it, or if a test provokes it on"
		echo "purpose, make the test assert the outcome instead of letting the"
		echo "engine print it."
		grep -n "SCRIPT ERROR" -A1 "$log" | sort -u | head -40
		status=1
	fi
	rm -f "$log"
	return $status
}

run_scene res://tests/TestRunner.tscn
unit_status=$?

# Headless physics integration probes (separate scenes; advance real frames).
echo "=== integration probes ==="
reset_store
run_scene res://tests/integration/LandProbe.tscn
land_status=$?
reset_store
run_scene res://tests/integration/CoinProbe.tscn
coin_status=$?
reset_store
run_scene res://tests/integration/OwlProbe.tscn
owl_status=$?
reset_store
run_scene res://tests/integration/ShootProbe.tscn
shoot_status=$?
reset_store
run_scene res://tests/integration/DeathProbe.tscn
death_status=$?
reset_store
run_scene res://tests/integration/PerfProbe.tscn
perf_status=$?

exit $(( guard_status != 0 || asset_status != 0 || reach_status != 0 || unit_status != 0 || land_status != 0 || coin_status != 0 || owl_status != 0 || shoot_status != 0 || death_status != 0 || perf_status != 0 ))
