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



# --- WHEN a lesson arrives ---------------------------------------------------
#
# The rules above are all about ONE lesson: is this idea new, and how much of it
# does the child get. None of them looked at the moment it lands, and that is
# what the child actually feels. Teaching used to fire in front of any question
# whose concept was unseen -- an ambush on an idea nobody asked about -- and once
# fired, the idea was marked seen and there was no way back to it.
#
# Now: one lesson per CATEGORY, for the rung the child is standing on, delivered
# after an answer, and re-openable forever from the board's "?".

func _stand_on(domain: String, step: int) -> void:
	var snapshot := LearnerStateManager.get_snapshot()
	(snapshot["curriculumProgress"][domain] as Dictionary)["currentStep"] = step
	LearnerStateManager.replace_snapshot(snapshot)

## Standing on a rung whose lesson has never been shown is what owes a lesson.
## Levelling up is simply what puts a child there.
func test_the_rung_a_child_stands_on_owes_its_lesson() -> void:
	var seen := SaveManager.get_tutorials_seen().duplicate(true)
	var was := LearnerStateManager.get_current_step("addition")
	_clear_seen()
	_stand_on("addition", 7)
	assert_eq(String(TutorialManager.pending_lesson("addition").get("id", "")), "addition.make_ten",
		"the lesson owed is the one for where the child stands")
	_stand_on("addition", was)
	_restore_seen(seen)

## A lesson already given is not owed again.
func test_a_seen_lesson_is_never_owed_again() -> void:
	var seen := SaveManager.get_tutorials_seen().duplicate(true)
	var was := LearnerStateManager.get_current_step("addition")
	_clear_seen()
	_stand_on("addition", 7)
	SaveManager.mark_tutorial_seen("addition.make_ten", false)
	assert_true(TutorialManager.pending_lesson("addition").is_empty(),
		"a lesson the child has had is not owed a second time")
	_stand_on("addition", was)
	_restore_seen(seen)

## ONE per category, and the categories owe independently: settling addition
## leaves counting exactly where it was.
func test_categories_owe_independently() -> void:
	var seen := SaveManager.get_tutorials_seen().duplicate(true)
	_clear_seen()
	var add_id := String(TutorialManager.pending_lesson("addition").get("id", ""))
	assert_true(add_id != "", "addition owes something")
	assert_true(not TutorialManager.pending_lesson("counting").is_empty(), "so does counting")
	SaveManager.mark_tutorial_seen(add_id, false)
	assert_true(TutorialManager.pending_lesson("addition").is_empty(), "addition settled")
	assert_true(not TutorialManager.pending_lesson("counting").is_empty(),
		"and settling addition left counting untouched")
	_restore_seen(seen)

## A debt in another category is still found at the next owl.
##
## A child can level up in counting and then not meet a counting question for a
## whole level. Preferring the answered domain keeps the common case in order;
## falling through to the others stops the debt going stale.
func test_a_debt_in_another_category_is_still_found() -> void:
	var seen := SaveManager.get_tutorials_seen().duplicate(true)
	_clear_seen()
	# Settle addition so the only thing outstanding is somewhere else.
	for domain in MathDomains.ALL:
		if String(domain) == "counting":
			continue
		var id := String(TutorialManager.pending_lesson(String(domain)).get("id", ""))
		if id != "":
			SaveManager.mark_tutorial_seen(id, false)
	var lesson := TutorialManager.pending_lesson_any("addition")
	assert_true(not lesson.is_empty(), "answering an addition question finds the counting debt")
	assert_true(String(lesson.get("id", "")).begins_with("counting."),
		"and it is counting's lesson: %s" % String(lesson.get("id", "")))
	_restore_seen(seen)

## The debt is DERIVED, not stored -- which is what makes it survive quitting.
##
## The first version of this held pending lessons in a runtime dictionary filled
## by curriculum_step_up. A child who levelled up and then closed the game was
## never taught that rung at all, because nothing re-raised the debt.
func test_the_debt_survives_with_no_event_to_remember_it() -> void:
	var seen := SaveManager.get_tutorials_seen().duplicate(true)
	var was := LearnerStateManager.get_current_step("addition")
	_clear_seen()
	_stand_on("addition", 12)
	var first := String(TutorialManager.pending_lesson("addition").get("id", ""))
	assert_eq(first, "addition.teen_numbers", "owed on arrival")
	assert_eq(String(TutorialManager.pending_lesson("addition").get("id", "")), first,
		"and still owed later, with no step-up event in between to remember it")
	_stand_on("addition", was)
	_restore_seen(seen)


# --- the help button ---------------------------------------------------------

## The lesson for where a child STANDS, seen or not. This is the whole point:
## asking for help must work on the idea they are stuck on, which is by
## definition one they have already been taught.
func test_help_returns_the_current_lesson_even_once_seen() -> void:
	var seen := SaveManager.get_tutorials_seen().duplicate(true)
	_clear_seen()
	var domain := "addition"
	var before := TutorialManager.current_lesson_for(domain)
	assert_true(not before.is_empty(), "there is a lesson for where the child stands")
	SaveManager.mark_tutorial_seen(String(before.get("id", "")), false)
	var after := TutorialManager.current_lesson_for(domain)
	assert_eq(String(after.get("id", "")), String(before.get("id", "")),
		"and having seen it does not take it away -- that is what help IS")
	_restore_seen(seen)

## Asking for help records nothing. A child checking the explanation has not
## answered anything, and must not look to the ladder like they have.
func test_asking_for_help_marks_nothing_seen() -> void:
	var seen := SaveManager.get_tutorials_seen().duplicate(true)
	_clear_seen()
	TutorialManager.current_lesson_for("addition")
	TutorialManager.current_lesson_for("subtraction")
	assert_true(SaveManager.get_tutorials_seen().is_empty(),
		"looking a lesson up is not being taught it")
	_restore_seen(seen)

## An unknown category has no lesson, so the button hides rather than opening on
## nothing.
func test_help_is_absent_where_there_is_no_lesson() -> void:
	assert_true(TutorialManager.current_lesson_for("").is_empty(), "no domain, no lesson")
	assert_true(TutorialManager.current_lesson_for("not_a_domain").is_empty(),
		"an unknown category offers no help rather than an empty board")


# --- the help button, on the actual board ------------------------------------

const MATH_CHALLENGE := preload("res://scenes/MathChallenge.tscn")

func _board_for(domain: String) -> Node:
	var panel: Node = MATH_CHALLENGE.instantiate()
	Engine.get_main_loop().root.add_child(panel)
	panel.present({
		"id": "help_probe",
		"domain": domain,
		"prompt": {"text": "1 + 1 = ?"},
		"answer": {"mode": "mcq", "correct": 2, "options": [2, 3, 4, 5]},
	}, {"npcName": "Hoot", "npcGreeting": "Hi", "problemCount": 1, "currentProblemIndex": 1})
	return panel

func _find_help(node: Node) -> Node:
	if node is BrandButton and node.text == TextManager.t("math.help"):
		return node
	for child in node.get_children():
		var found := _find_help(child)
		if found != null:
			return found
	return null

## The button exists on a real board, not just in the function that would draw
## it. Everything else about help is logic; this is the half a child touches, and
## a header row that silently never got the button would pass every other test
## here.
func test_the_board_carries_a_help_button() -> void:
	var panel := _board_for("addition")
	await Engine.get_main_loop().process_frame
	var help := _find_help(panel)
	assert_true(help != null, "an addition question offers its lesson from the board")
	if help != null:
		var floor_px := float(Config.ui("math_challenge/help_button_size", 88))
		assert_true(help.custom_minimum_size.x >= floor_px and help.custom_minimum_size.y >= floor_px,
			"and it clears the 88px tap-target floor a struggling child has to hit")
	panel.queue_free()

## A domain with no lesson to give shows no button, rather than one that opens on
## nothing. `domain` comes off problem data, so this is also the guard against a
## malformed problem taking the board down.
func test_no_help_button_where_there_is_no_lesson() -> void:
	var panel := _board_for("not_a_domain")
	await Engine.get_main_loop().process_frame
	assert_true(_find_help(panel) == null, "no lesson, no button")
	panel.queue_free()
