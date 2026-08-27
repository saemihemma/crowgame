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
## Two owls' worth of clicking, not one: phase two walks further owls until the
## lesson earned by levelling up is handed over.
const MAX_FRAMES := 2400
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
## Phase 2: the lesson a child EARNS by levelling up, delivered at the next owl
## rather than in front of the question that earned it. See below.
var _phase_one_completes := -1
## Owls phase two has already walked up to, by instance id. An owl can decline an
## encounter -- its band may not intersect the level's -- and without this the
## walk re-offers the same declining owl every frame and gets nowhere.
var _tried: Dictionary = {}
var _earned_lesson_id := ""
var _earned_pending_id := ""
var _phase_two := false

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
	# FIRST, so that every branch below is free to `return`. This check used to
	# sit at the bottom, and the phase-two branch returns unconditionally -- which
	# turned "the earned lesson never arrived" from a failing probe into a hung
	# one, with no output at all to say why.
	if _frames >= MAX_FRAMES:
		_finish(false, "timed out (phase_two=%s, first-owl completes=%d, owl_saved=%s, earned='%s', owed='%s')" % [
			str(_phase_two), _phase_one_completes, str(_owl_saved), _earned_lesson_id, _earned_pending_id])
		return
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
			if _phase_two:
				# Only the lesson the step-up actually owed counts. A later owl
				# may open a FIRST-CONTACT lesson for a domain the child has not
				# met yet, and counting that as the delivery would pass this
				# probe without the earned path ever running.
				if lesson.tutorial_id() == _earned_pending_id:
					_earned_lesson_id = lesson.tutorial_id()
			else:
				_lesson_id = lesson.tutorial_id()
				_lesson_cards_seen = maxi(_lesson_cards_seen, lesson.current_index() + 1)
			if lesson.current_index() < lesson.card_count() - 1:
				lesson.advance()
			else:
				var guided := _guided_index(lesson.current_card())
				if guided >= 0:
					lesson.choose(guided)
				else:
					# A last card with nothing to answer -- an earned lesson ends
					# on the worked example, not a guided try. Advance is what the
					# Done button does.
					lesson.advance()
		return

	# Answer each presented problem correctly (once per overlay instance).
	if _game.is_math_challenge_active():
		var overlay = _game.get_math_challenge()
		if overlay.is_active() and overlay.get_instance_id() != _answered_overlay_id:
			var idx := _correct_index(overlay.current_problem)
			if idx >= 0:
				_answered_overlay_id = overlay.get_instance_id()
				overlay.submit_answer(idx)

	# PHASE 2: the lesson a child EARNS by levelling up.
	#
	# Answering the first owl's freebie correctly steps the child up a rung, and
	# the concept on that new rung is one they have never been taught. That debt
	# is deliberately NOT paid on the spot -- a second board of cards on the same
	# owl is the ambush this design removes -- so it is held per category and
	# delivered after the next owl's answer.
	#
	# What this does and does not prove: it proves a SECOND lesson reaches the
	# child at a LATER owl, which the first owl alone cannot show, and it pins the
	# id so a delivery of the wrong category's lesson fails here. It does not
	# separate the after-answer path from a later owl's own first contact -- for a
	# fresh domain those converge on the same lesson by design. The rule that
	# picks it (the debt is the rung you stand on, derived not remembered) is
	# covered directly in test_math_teaching_budget.gd.
	if _owl_saved and not is_instance_valid(_owl) and not _phase_two:
		_phase_two = true
		_phase_one_completes = _completes
		_earned_pending_id = String(TutorialManager.pending_lesson_any("").get("id", ""))
		if _earned_pending_id == "":
			_finish(false, "levelling up earned no lesson to deliver")
			return

	# Walk the rest of the level's owls until the earned lesson is handed over.
	#
	# Not "the very next owl", because that owl may itself be the child's first
	# contact with a second domain -- and one lesson per owl is the rule, so the
	# debt waits one more. Bounded by the owls that exist: running out is the
	# failure, not the timeout.
	if _phase_two and _earned_lesson_id == "":
		if _game.is_math_challenge_active() or _game.is_math_tutorial_active():
			return
		var next_owl := _next_untried_owl()
		if next_owl == null:
			_finish(false, "ran out of owls with %s still owed" % _earned_pending_id)
			return
		_tried[next_owl.get_instance_id()] = true
		next_owl.interact()
		return

	if _phase_two and _earned_lesson_id != "" and not _game.is_math_tutorial_active():
		_finish(true, "")
		return


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
	if ok and _phase_one_completes != _expected_problems:
		ok = false
		msg = "solved %d problem(s) at the first owl, registry says the chain is %d link(s)" % [
			_phase_one_completes, _expected_problems]
	# The earned lesson has to be the one the step-up actually owed, not just any
	# lesson: delivering the wrong category's would look identical from here.
	if ok and _earned_lesson_id == "":
		ok = false
		msg = "the lesson earned by levelling up was never delivered (owed %s)" % _earned_pending_id
	if ok and _earned_lesson_id == _lesson_id:
		ok = false
		msg = "the earned lesson repeated the opening one (%s)" % _lesson_id
	if ok:
		print("[pass] owl_probe: lesson %s (%d cards) then %d/%d chain link(s) solved, owl_saved, owl flew away, ELO %.2f -> %.2f; levelling up earned %s and the next owl delivered it" % [
			_lesson_id, _lesson_cards_seen, _completes, _expected_problems, _elo_before, elo_after, _earned_lesson_id])
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

## Any owl still standing in the level.
##
## No "skip the one we did" argument: a freed owl is already out of the tree, and
## holding a reference to compare against is how this probe first crashed --
## `_owl` is dangling by the time phase two starts.
## The next owl phase two has not already offered itself to.
##
## An owl whose difficulty band does not intersect the level's declines the
## encounter, and a declined owl looks exactly like an un-offered one from out
## here -- so they are tracked rather than re-detected.
func _next_untried_owl() -> Node2D:
	for c in _game.get_node("World").get_children():
		if not is_instance_valid(c) or _tried.has(c.get_instance_id()):
			continue
		if c.scene_file_path.get_file() == "Npc.tscn" and c.has_method("interact"):
			return c
	return null

func _find_owl() -> Node2D:
	for c in _game.get_node("World").get_children():
		if not is_instance_valid(c):
			continue
		if c.scene_file_path.get_file() == "Npc.tscn" and c.has_method("interact"):
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
