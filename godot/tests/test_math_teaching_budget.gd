extends TestCase
## How often a child is taught, and how much of a lesson they get.
##
## The lesson stack was built one rule at a time and the rules never met: teach
## once per domain, then teach once per concept, then teach on whatever problem
## the selector happened to deal. Forty-seven concepts across eight domains, four
## cards and a guided question each, and a stretch lane that deals a rung the
## child has not reached -- which together is a child being taught the same shape
## over and over in front of a question they came here to answer.
##
## The budget these lock:
##   - a new CATEGORY earns the full four-card lesson
##   - a new rung inside a known category earns a reminder, not a lesson
##   - a concept the ladder has not reached is not taught at all
##   - a single-card lesson shows no progress dots

func _reset() -> void:
	_failures.clear()
	_assertions = 0


# --- depth ----------------------------------------------------------------

## First contact with a domain is the one time the whole arc is worth it:
## objects, then the model, then the symbols, then your turn.
func test_the_first_lesson_in_a_domain_is_the_full_one() -> void:
	var seen := SaveManager.get_tutorials_seen().duplicate(true)
	_clear_seen()
	assert_eq(TutorialManager.depth_for("addition.count_all"), TutorialManager.DEPTH_FULL,
		"a child who has been taught nothing about addition gets the full lesson")
	_restore_seen(seen)


## Every rung after that is a reminder. This is the whole complaint: a child four
## hundred additions in does not need to be walked from objects again to be told
## how a ten works.
func test_a_later_rung_in_the_same_domain_is_brief() -> void:
	var seen := SaveManager.get_tutorials_seen().duplicate(true)
	_clear_seen()
	SaveManager.mark_tutorial_seen("addition.count_all", false)
	assert_eq(TutorialManager.depth_for("addition.make_ten"), TutorialManager.DEPTH_BRIEF,
		"the second addition idea is a reminder, not a lesson")
	assert_eq(TutorialManager.depth_for("subtraction.take_away"), TutorialManager.DEPTH_FULL,
		"but a different domain is still a first meeting")
	_restore_seen(seen)


## A skipped lesson still counts as taught. Re-offering a lesson a child declined
## would make the Skip button a lie.
func test_a_skipped_lesson_still_shortens_the_next_one() -> void:
	var seen := SaveManager.get_tutorials_seen().duplicate(true)
	_clear_seen()
	SaveManager.mark_tutorial_seen("counting.to_five", true)
	assert_eq(TutorialManager.depth_for("counting.to_ten"), TutorialManager.DEPTH_BRIEF,
		"declining the first counting lesson is still having met counting")
	_restore_seen(seen)


# --- what a brief lesson actually plays -----------------------------------

func test_a_brief_lesson_plays_fewer_cards_than_a_full_one() -> void:
	var full := _overlay("addition.count_all", TutorialManager.DEPTH_FULL)
	var brief := _overlay("addition.count_all", TutorialManager.DEPTH_BRIEF)
	assert_true(brief.card_count() < full.card_count(),
		"brief is shorter (%d vs %d cards)" % [brief.card_count(), full.card_count()])
	assert_true(brief.card_count() > 0, "but it still teaches something")
	_drop(full)
	_drop(brief)


## The reminder drops the guided try on purpose: a question in front of the
## owl's question is two questions to answer one owl, which is the opposite of
## what shortening the lesson was for.
func test_a_brief_lesson_asks_no_question_of_its_own() -> void:
	for tutorial: Variant in DataManager.get_dict("MATH_TUTORIALS").get("tutorials", []):
		var id := String((tutorial as Dictionary)["id"])
		var overlay := _overlay(id, TutorialManager.DEPTH_BRIEF)
		for i in overlay.card_count():
			var card: Dictionary = (overlay._cards[i] as Dictionary)
			assert_true(not card.has("choice"),
				"%s brief card %d asks nothing" % [id, i])
		_drop(overlay)


## Naming a card that does not exist must cost extra reading, never a lesson that
## opens on nothing and cannot be advanced past.
func test_an_unknown_brief_card_name_falls_back_to_the_whole_lesson() -> void:
	# math_tutorial.gd carries no class_name (it is a scene root, not a type), so
	# the static is reached through the script resource rather than a global.
	var script: GDScript = load("res://scripts/ui/math_tutorial.gd")
	var lesson := TutorialManager.get_tutorial("addition.count_all")
	var cards: Array = script._cards_for_depth(lesson, TutorialManager.DEPTH_BRIEF)
	assert_true(cards.size() > 0, "the tuned brief set resolves to something")
	assert_true(cards.size() < (lesson["cards"] as Array).size(), "and to fewer than all of them")
	var bogus := {"id": "x", "cards": [{"body": "nothing_named_this", "visual": "equation", "params": {}}]}
	assert_eq((script._cards_for_depth(bogus, TutorialManager.DEPTH_BRIEF) as Array).size(), 1,
		"a lesson whose cards match no brief name plays in full rather than empty")


# --- the dots -------------------------------------------------------------

## A row of dots on a one-card lesson is an unexplained mark that says nothing
## the Next button has not already said.
func test_a_single_card_lesson_shows_no_progress_dots() -> void:
	var one := {
		"id": "probe.single",
		"cards": [{"body": "worked", "visual": "equation", "params": {"a": 1, "op": "+", "b": 1, "result": 2}}],
	}
	var scene: PackedScene = load("res://scenes/MathTutorial.tscn")
	var overlay: CanvasLayer = scene.instantiate()
	Engine.get_main_loop().root.add_child(overlay)
	overlay.present(one)
	assert_eq(overlay.card_count(), 1, "one card")
	assert_true(not overlay._dots.visible, "and no dots row")
	_drop(overlay)


# --- when a lesson is allowed to fire -------------------------------------

## The stretch lane deals a problem one step past the ladder at a tuned rate.
## Teaching its concept would open a lesson for an idea the child has not
## reached, mid-run, on a question that exists to be a reach.
func test_a_concept_above_the_learner_is_not_taught() -> void:
	var seen := SaveManager.get_tutorials_seen().duplicate(true)
	var snapshot := LearnerStateManager.get_snapshot().duplicate(true)
	_clear_seen()
	LearnerStateManager.replace_snapshot(
		MathPlacement.place_snapshot(LearnerStateManager.get_snapshot(), "addition", 0))

	var reachable := TutorialManager.tutorial_for_problem(_problem("addition", 0))
	assert_true(not reachable.is_empty(), "the rung the child is standing on is teachable")

	var stretch_step := ConceptLadder.next_concept_step("addition", 0)
	assert_true(stretch_step > 0, "there is a concept above step 0 to reach for")
	var above := TutorialManager.tutorial_for_problem(_problem("addition", stretch_step))
	assert_true(above.is_empty(),
		"a concept starting at step %d is not taught to a child on step 0" % stretch_step)

	LearnerStateManager.replace_snapshot(snapshot)
	_restore_seen(seen)


# --- helpers ---------------------------------------------------------------

func _problem(domain: String, step: int) -> Dictionary:
	return {"id": "probe-%s-%d" % [domain, step], "domain": domain, "curriculumStep": step, "skills": []}


func _overlay(tutorial_id: String, depth: String) -> CanvasLayer:
	var scene: PackedScene = load("res://scenes/MathTutorial.tscn")
	var overlay: CanvasLayer = scene.instantiate()
	Engine.get_main_loop().root.add_child(overlay)
	overlay.present(TutorialManager.get_tutorial(tutorial_id), depth)
	return overlay


func _drop(overlay: CanvasLayer) -> void:
	if is_instance_valid(overlay):
		overlay.queue_free()


func _clear_seen() -> void:
	for id in SaveManager.get_tutorials_seen().keys():
		TutorialManager.forget(String(id))


func _restore_seen(seen: Dictionary) -> void:
	_clear_seen()
	for id in seen:
		SaveManager.mark_tutorial_seen(String(id), bool((seen[id] as Dictionary).get("skipped", false)))


# --- how often ---------------------------------------------------------------
#
# The rules above are all about ONE lesson: is this idea new, and how much of a
# lesson does it earn. None of them looked at the next lesson, and the child
# feels the sequence rather than any single board. The only limit used to be one
# lesson per OWL, so a level with three owls could open three of them in one run.

## A level teaches, and then it has taught.
func test_a_level_spends_its_teaching_budget() -> void:
	TutorialManager.begin_level()
	assert_true(TutorialManager.can_teach_now(), "a fresh level has room for a lesson")
	TutorialManager.spend_lesson()
	assert_true(not TutorialManager.can_teach_now(),
		"and having taught once, it is done for this level")

## The budget is per level, not per game: the next level teaches again.
##
## This is what keeps the cap from being a silent cut. Nothing is lost when a
## lesson is refused -- the concept stays unseen, so it is taught the next time
## its rung comes up.
func test_the_next_level_can_teach_again() -> void:
	TutorialManager.begin_level()
	TutorialManager.spend_lesson()
	assert_true(not TutorialManager.can_teach_now(), "spent")
	TutorialManager.begin_level()
	assert_true(TutorialManager.can_teach_now(), "the next level starts with a full budget")

## A refused lesson is not a forgotten one.
##
## The cap must never write to `seen`: a concept that did not fit in this level
## has to still be unseen, or the child is silently never taught it at all.
func test_a_budget_refusal_does_not_mark_anything_seen() -> void:
	var seen := SaveManager.get_tutorials_seen().duplicate(true)
	_clear_seen()
	TutorialManager.begin_level()
	TutorialManager.spend_lesson()
	assert_true(SaveManager.get_tutorials_seen().is_empty(),
		"spending the budget teaches nobody anything by itself")
	assert_true(not TutorialManager.has_seen("addition.count_all"),
		"and the concept that did not fit is still waiting to be taught")
	_restore_seen(seen)

## The cap is a tuning number, and -1 is the way back to the old behaviour
## without editing a .gd.
func test_a_negative_cap_means_no_cap() -> void:
	var tuning: Dictionary = DataManager.get_dict("TUTORIAL_TUNING")
	var before: Variant = tuning.get("lessons_per_level", 1)
	tuning["lessons_per_level"] = -1
	TutorialManager.begin_level()
	for i in 5:
		TutorialManager.spend_lesson()
	assert_true(TutorialManager.can_teach_now(),
		"an uncapped level keeps teaching however many rungs it meets")
	tuning["lessons_per_level"] = before
	TutorialManager.begin_level()

## The shipped number, pinned. Changing it is a product decision about how a
## level feels, so it should fail here and be changed on purpose.
func test_the_shipped_budget_is_one_lesson_per_level() -> void:
	assert_eq(int(Config.tutorial("lessons_per_level", -99)), 1,
		"one lesson per level is what ships")
