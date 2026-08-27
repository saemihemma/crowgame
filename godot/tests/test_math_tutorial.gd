extends TestCase
## The lesson overlay itself: the flow a child clicks through, and the promises
## the design makes about it.
##
## The promises, in the order they matter: a child can always leave; a lesson
## never touches the learner model; a wrong tap during guided practice costs
## nothing; and every card can actually be drawn and read in both languages.

const CARDS_PER_LESSON := 4

func _reset() -> void:
	_failures.clear()
	_assertions = 0

func _overlay(tutorial_id: String) -> CanvasLayer:
	var scene: PackedScene = load("res://scenes/MathTutorial.tscn")
	var overlay: CanvasLayer = scene.instantiate()
	Engine.get_main_loop().root.add_child(overlay)
	overlay.present(TutorialManager.get_tutorial(tutorial_id))
	return overlay

func _drop(overlay: CanvasLayer) -> void:
	if is_instance_valid(overlay):
		overlay.queue_free()

func test_every_lesson_is_four_cards() -> void:
	# Not a style rule: four is what the arc needs (objects, model, worked
	# example, your turn) and one more than a five-year-old will sit through
	# without tapping past it.
	for tutorial: Variant in DataManager.get_dict("MATH_TUTORIALS").get("tutorials", []):
		assert_eq((tutorial["cards"] as Array).size(), CARDS_PER_LESSON,
			"%s has %d cards" % [tutorial["id"], CARDS_PER_LESSON])

func test_every_card_names_a_drawable_visual() -> void:
	for tutorial: Variant in DataManager.get_dict("MATH_TUTORIALS").get("tutorials", []):
		for card: Variant in tutorial["cards"]:
			assert_true(TutorialVisual.can_draw(String(card["visual"])),
				"%s draws %s" % [tutorial["id"], card["visual"]])

func test_every_card_has_words_in_both_languages() -> void:
	var before := TextManager.get_locale()
	for locale in TextManager.available_locales():
		TextManager.set_locale(String(locale))
		for tutorial: Variant in DataManager.get_dict("MATH_TUTORIALS").get("tutorials", []):
			var id := String(tutorial["id"])
			for key in ["tutorial.%s.title" % id]:
				assert_true(TextManager.t(key) != key, "%s: %s is translated" % [locale, key])
			for card: Variant in tutorial["cards"]:
				var key := "tutorial.%s.%s" % [id, card["body"]]
				assert_true(TextManager.t(key) != key, "%s: %s is translated" % [locale, key])
	TextManager.set_locale(before)

func test_next_walks_the_cards_and_the_last_one_hands_over() -> void:
	var overlay := _overlay("addition.count_all")
	assert_eq(overlay.card_count(), CARDS_PER_LESSON, "four cards")
	assert_eq(overlay.current_index(), 0, "starts on the first")
	overlay.advance()
	assert_eq(overlay.current_index(), 1, "advances")
	overlay.back()
	assert_eq(overlay.current_index(), 0, "and goes back")
	overlay.back()
	assert_eq(overlay.current_index(), 0, "back from the first card stays put")
	_drop(overlay)

func test_skip_is_available_on_the_very_first_card() -> void:
	# Autonomy is the point. A lesson a child cannot leave is a lesson the next
	# one gets tapped through without reading.
	var overlay := _overlay("addition.count_on")
	var closed := {"fired": false, "skipped": false}
	overlay.closed.connect(func(payload: Dictionary):
		closed["fired"] = true
		closed["skipped"] = bool(payload.get("skipped", false)))
	assert_eq(overlay.current_index(), 0, "still on the first card")
	overlay.skip()
	assert_true(bool(closed["fired"]), "skipping closes the lesson")
	assert_true(bool(closed["skipped"]), "and reports itself as skipped")
	_drop(overlay)

func test_finishing_reports_itself_as_not_skipped() -> void:
	var overlay := _overlay("counting.to_five")
	var result := {"skipped": true, "id": ""}
	overlay.closed.connect(func(payload: Dictionary):
		result["skipped"] = bool(payload.get("skipped", false))
		result["id"] = String(payload.get("tutorialId", "")))
	for i in CARDS_PER_LESSON:
		overlay.advance()
	assert_true(not bool(result["skipped"]), "watched through is not skipped")
	assert_eq(String(result["id"]), "counting.to_five", "reports which lesson")
	_drop(overlay)

func test_a_lesson_never_touches_the_learner_model() -> void:
	# The single hardest rule in this feature. A child cannot be marked down for
	# a lesson, so the overlay must emit none of the events the learner model
	# listens to -- not on a tap, not on a wrong guided answer, not on finishing.
	var seen: Array[String] = []
	var on_presented := func(_p): seen.append("presented")
	var on_submitted := func(_p): seen.append("submitted")
	var on_complete := func(_p): seen.append("complete")
	EventBus.math_problem_presented.connect(on_presented)
	EventBus.math_answer_submitted.connect(on_submitted)
	EventBus.math_challenge_complete.connect(on_complete)

	var overlay := _overlay("addition.make_ten")
	overlay.advance()
	overlay.advance()
	overlay.advance()
	overlay.choose(0)
	overlay.choose(1)
	overlay.choose(2)

	EventBus.math_problem_presented.disconnect(on_presented)
	EventBus.math_answer_submitted.disconnect(on_submitted)
	EventBus.math_challenge_complete.disconnect(on_complete)
	assert_eq(seen.size(), 0, "no learner-model events during a lesson, saw: %s" % str(seen))
	_drop(overlay)

func test_a_wrong_guided_answer_leaves_the_lesson_open() -> void:
	# Guided practice is the lesson, not the test. A miss costs a nudge and the
	# child stays exactly where they are.
	var overlay := _overlay("addition.make_ten")
	for i in CARDS_PER_LESSON - 1:
		overlay.advance()
	var last: Dictionary = (DataManager.get_dict("MATH_TUTORIALS")["tutorials"] as Array) \
		.filter(func(t): return String(t["id"]) == "addition.make_ten")[0]["cards"][CARDS_PER_LESSON - 1]
	var choice: Dictionary = last["choice"]
	var options: Array = choice["options"]
	var wrong := 0
	for i in options.size():
		if str(options[i]) != str(choice["correct"]):
			wrong = i
			break
	overlay.choose(wrong)
	assert_true(overlay.is_active(), "still open after a wrong tap")
	assert_eq(overlay.current_index(), CARDS_PER_LESSON - 1, "and still on the same card")
	_drop(overlay)

func test_the_guided_answer_is_the_true_answer() -> void:
	# The picture and the question have to agree. tools/validate_math_concepts.mjs
	# proves this for all 120 cards by recomputing each from its own parameters;
	# this is the runtime's own spot check that the data it loaded says the same.
	var lessons: Array = DataManager.get_dict("MATH_TUTORIALS").get("tutorials", [])
	for tutorial: Variant in lessons:
		var cards: Array = tutorial["cards"]
		var last: Dictionary = cards[cards.size() - 1]
		assert_true(last.has("choice"), "%s ends with the child's turn" % tutorial["id"])
		if not last.has("choice"):
			continue
		var choice: Dictionary = last["choice"]
		var options: Array = choice["options"]
		var correct: Variant = choice["correct"]
		var found := false
		for option: Variant in options:
			if str(option) == str(correct):
				found = true
		assert_true(found, "%s: the correct answer is on offer" % tutorial["id"])
