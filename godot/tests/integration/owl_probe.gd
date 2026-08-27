extends Node
## Headless integration probe (Slice 6): drives the full owl encounter end to
## end — interact -> the owl's chain of problems -> answer correctly -> challenge
## complete -> ELO/learner update -> owl_saved -> owl flies away. Answers via the
## overlay's submit_answer() (the buttons' code path).
##
## The chain length is read from the owl's own registry entry and asserted, not
## assumed. This probe used to print "2 problems solved" from a fixed string
## while counting nothing, so when the roster moved to a one-answer default the
## message quietly became a lie and no test disagreed.
##
## A fresh learner meets the concept lesson first, so the probe clicks through
## that too -- and asserts it happened. This is the only place the whole chain
## (owl -> lesson -> guided answer -> freebie question -> learner update) is
## exercised against the real scene tree rather than against data.
##
## Run: godot --headless --path godot res://tests/integration/OwlProbe.tscn

const GAME_SCENE := preload("res://scenes/Game.tscn")
const MAX_FRAMES := 900  # a fresh learner clicks through the concept lesson before the freebie problem
## The lesson a fresh learner's first owl must open with: level_01 gates counting
## first, and a fresh profile starts at counting step 2.
const EXPECTED_LESSON := "counting.to_ten"

var _game: Node2D
var _frames := 0
var _owl: Node2D
var _started := false
var _owl_saved := false
var _completes := 0
var _elo_before := 0.0
var _answered_overlay_id := 0
var _expected_problems := 0
var _lesson_id := ""
var _lesson_cards_seen := 0

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
		_expected_problems = _chain_length_of(_owl)
		if _expected_problems <= 0:
			_finish(false, "owl has no math_challenge component")
			return
		# A chain is a COUNT, and a set of one counts nothing. This owl asks a
		# single question, so it wears no chain -- a lone 22px ring hovering at its
		# feet with nothing to be one OF is the thing a player asked about. The owl
		# sprite is already drawn in chains holding a padlock, so nothing is lost.
		var drawn := _drawn_chain_links(_owl)
		if _expected_problems < Npc.MIN_VISIBLE_CHAIN_LINKS and drawn > 0:
			_finish(false, "a %d-question owl drew %d chain link(s)" % [_expected_problems, drawn])
			return
		_owl.interact()
		return

	# The lesson comes first. Click through it exactly as a child would: Next to
	# the last card, then answer the guided question.
	if _game.is_math_tutorial_active():
		var lesson = _game.get_math_tutorial()
		if lesson.is_active():
			_lesson_id = lesson.tutorial_id()
			_lesson_cards_seen = maxi(_lesson_cards_seen, lesson.current_index() + 1)
			if lesson.current_index() < lesson.card_count() - 1:
				lesson.advance()
			else:
				var guided := _guided_index(lesson.current_card())
				if guided >= 0:
					lesson.choose(guided)
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
	if ok and _lesson_id == "":
		ok = false
		msg = "a fresh learner's first owl showed no concept lesson at all"
	if ok and _lesson_id != EXPECTED_LESSON:
		ok = false
		msg = "opened with lesson %s, expected %s" % [_lesson_id, EXPECTED_LESSON]
	if ok and _lesson_cards_seen < 4:
		ok = false
		msg = "the lesson only reached card %d of 4" % _lesson_cards_seen
	if ok and _completes != _expected_problems:
		ok = false
		msg = "solved %d problem(s), registry says the chain is %d link(s)" % [_completes, _expected_problems]
	if ok:
		print("[pass] owl_probe: lesson %s (%d cards) then %d/%d chain link(s) solved, owl_saved, owl flew away, ELO %.2f -> %.2f" % [
			_lesson_id, _lesson_cards_seen, _completes, _expected_problems, _elo_before, elo_after])
	else:
		print("[FAIL] owl_probe: %s" % msg)
	get_tree().quit(0 if ok else 1)

## How many correct answers this owl asks for, straight from the registry entry
## it spawned with — the same number the HUD chain art is sized from.
func _chain_length_of(owl: Node2D) -> int:
	for c in owl.definition.get("components", []):
		if String(c.get("type", "")) == "math_challenge":
			return int(c.get("problemCount", 1))
	return -1

## How many chain-link sprites this owl actually built. Reads the node rather
## than the registry: the registry is what the owl WANTS, and this is what a
## child SEES.
func _drawn_chain_links(owl: Node2D) -> int:
	var count := 0
	for c in owl.get_children():
		if c is Sprite2D and c.name != "Sprite":
			count += 1
	return count

func _find_owl() -> Node2D:
	for c in _game.get_node("World").get_children():
		if c.scene_file_path.get_file() == "Npc.tscn":
			return c
	return null

## The right answer to a lesson's guided question, read from the card.
func _guided_index(card: Dictionary) -> int:
	var choice: Dictionary = card.get("choice", {})
	var options: Array = choice.get("options", [])
	for i in options.size():
		if str(options[i]) == str(choice.get("correct", null)):
			return i
	return -1

func _correct_index(problem: Dictionary) -> int:
	var answer: Dictionary = problem.get("answer", {})
	var options: Array = answer.get("options", [])
	for i in options.size():
		if str(options[i]) == str(answer.get("correct", null)):
			return i
	return -1
