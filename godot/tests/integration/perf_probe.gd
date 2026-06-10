extends Node
## Phase 0: coarse performance budget gate. Loads the most entity-dense level and
## measures the engine's actual per-frame COMPUTE cost (process + physics_process
## time, via Performance monitors — not wall-clock, which is paced to 60 Hz
## real-time headless). Catches accidental per-frame blowups (O(n) scans every
## tick, etc.) before they ship. Not a GPU/render fps test.
##
## Run: godot --headless --path godot res://tests/integration/PerfProbe.tscn

const GAME_SCENE := preload("res://scenes/Game.tscn")
const WARMUP := 30
const SAMPLE := 180
const BUDGET_MS := 12.0  # generous ceiling: catches 2-3x blowups without flaking
                         # on slower CI hardware (baseline ~5ms headless here)

var _game: Node2D
var _frames := 0
var _accum_ms := 0.0

func _ready() -> void:
	_game = GAME_SCENE.instantiate()
	_game.level_key = "level_01"  # densest: 20 coins, 6 hazards, 3 enemies, 2 NPCs
	add_child(_game)

func _process(_delta: float) -> void:
	_frames += 1
	if _frames <= WARMUP:
		return
	# Engine-measured compute time for the frame (seconds), excludes idle pacing.
	var proc := Performance.get_monitor(Performance.TIME_PROCESS)
	var phys := Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)
	_accum_ms += (proc + phys) * 1000.0
	if _frames < WARMUP + SAMPLE:
		return
	var avg_ms := _accum_ms / SAMPLE
	if avg_ms <= BUDGET_MS:
		print("[pass] perf_probe: avg compute %.3f ms/frame over %d frames (budget %.1f ms)" % [avg_ms, SAMPLE, BUDGET_MS])
		get_tree().quit(0)
	else:
		print("[FAIL] perf_probe: avg compute %.3f ms/frame exceeds budget %.1f ms" % [avg_ms, BUDGET_MS])
		get_tree().quit(1)
