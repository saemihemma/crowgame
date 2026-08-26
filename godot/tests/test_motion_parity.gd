extends TestCase
## Tier-1 movement-feel parity: replays scripted input sequences through
## PlayerMotion and asserts vx/vy/timers match the TS reference tick-for-tick
## (tools/golden/gen_motion_fixtures.ts).

const FIX_PATH := "res://tests/fixtures/motion_fixtures.json"
const TOL := 1e-6

var _fix: Dictionary = {}
var _tuning: Dictionary = {}

## Per-test setup: load the golden fixtures and the motion tuning once.
func _reset() -> void:
	if _fix.is_empty():
		var f := FileAccess.open(FIX_PATH, FileAccess.READ)
		_fix = JSON.parse_string(f.get_as_text())
		f.close()
		var t := FileAccess.open("res://data/tuning/player_base.json", FileAccess.READ)
		_tuning = JSON.parse_string(t.get_as_text())
		t.close()

func test_motion_parity() -> void:
	var dt := float(_fix["dt"])
	for sc in _fix["scenarios"]:
		var state := PlayerMotion.new_state()
		var x := 100.0
		var y := 100.0
		var ticks: Array = sc["ticks"]
		var frames: Array = sc["frames"]
		for i in ticks.size():
			var input: Dictionary = ticks[i]
			var on_floor := bool(input.get("on_floor", false))
			PlayerMotion.compute_velocity(state, input, on_floor, _tuning, dt)
			x += float(state["vx"]) * dt
			y += float(state["vy"]) * dt
			var exp: Dictionary = frames[i]
			assert_almost_eq(float(state["vx"]), float(exp["vx"]), TOL, "%s f%d vx" % [sc["name"], i])
			assert_almost_eq(float(state["vy"]), float(exp["vy"]), TOL, "%s f%d vy" % [sc["name"], i])
			assert_almost_eq(float(state["coyote_ms"]), float(exp["coyote_ms"]), 1e-4, "%s f%d coyote" % [sc["name"], i])
			assert_almost_eq(float(state["jump_buffer_ms"]), float(exp["jump_buffer_ms"]), 1e-4, "%s f%d buffer" % [sc["name"], i])
			assert_eq(bool(state["is_jumping"]), bool(exp["is_jumping"]), "%s f%d is_jumping" % [sc["name"], i])
			assert_almost_eq(x, float(exp["x"]), 1e-4, "%s f%d x" % [sc["name"], i])
			assert_almost_eq(y, float(exp["y"]), 1e-4, "%s f%d y" % [sc["name"], i])
