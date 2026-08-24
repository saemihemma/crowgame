extends Node
## Headless integration probe (Slice 6): drives the full owl encounter end to
## end — interact -> the owl-selected problem(s) -> answer correctly -> challenge
## complete -> ELO/learner update -> owl_saved -> owl flies away. Answers via the
## overlay's submit_answer() (the buttons' code path).
##
## Run: godot --headless --path godot res://tests/integration/OwlProbe.tscn

const GAME_SCENE := preload("res://scenes/Game.tscn")
const MAX_FRAMES := 420

var _game: Node2D
var _frames := 0
var _owl: Node2D
var _started := false
var _owl_saved := false
var _completes := 0
var _elo_before := 0.0
var _answered_overlay_id := 0

func _ready() -> void:
	# Fresh learner so domains/steps are deterministic.
	ELOManager.initialize(null)
	LearnerStateManager.initialize({"childId": "c", "familyId": "f"}, null, ELOManager.get_stats())
	MathProblemManager.reset_answered()
	EventBus.owl_saved.connect(func(): _owl_saved = true)
	EventBus.math_challenge_complete.connect(func(_d): _completes += 1)
	_elo_before = ELOManager.get_global_elo()
	_game = GAME_SCENE.instantiate()
	_game.level_key = "level_01"
	add_child(_game)

func _physics_process(_delta: float) -> void:
	_frames += 1
	if _frames == 5 and not _started:
		_owl = _find_owl()
		if _owl == null:
			_finish(false, "no owl spawned")
			return
		_started = true
		_owl.interact()
		return

	# Answer each presented problem correctly (once per overlay instance).
	if _game.is_math_challenge_active():
		var overlay = _game.get_math_challenge()
		if overlay.is_active() and overlay.get_instance_id() != _answered_overlay_id:
			var idx := _correct_index(overlay.current_problem)
			if idx >= 0:
				_answered_overlay_id = overlay.get_instance_id()
				overlay.submit_answer(idx)

	if _owl_saved and not is_instance_valid(_owl):
		_finish(true, "")
		return
	if _frames >= MAX_FRAMES:
		_finish(false, "timed out (completes=%d, owl_saved=%s)" % [_completes, str(_owl_saved)])

func _finish(ok: bool, msg: String) -> void:
	var elo_after := ELOManager.get_global_elo()
	if ok and elo_after <= _elo_before:
		ok = false
		msg = "ELO did not increase (%.2f -> %.2f)" % [_elo_before, elo_after]
	if ok:
		print("[pass] owl_probe: %d problem(s) solved, owl_saved, owl flew away, ELO %.2f -> %.2f" % [_completes, _elo_before, elo_after])
	else:
		print("[FAIL] owl_probe: %s" % msg)
	get_tree().quit(0 if ok else 1)

func _find_owl() -> Node2D:
	for c in _game.get_node("World").get_children():
		if c.scene_file_path.get_file() == "Npc.tscn":
			return c
	return null

func _correct_index(problem: Dictionary) -> int:
	var answer: Dictionary = problem.get("answer", {})
	var options: Array = answer.get("options", [])
	for i in options.size():
		if str(options[i]) == str(answer.get("correct", null)):
			return i
	return -1
