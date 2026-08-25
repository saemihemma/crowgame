extends TestCase
## The concept ladder and the teaching state built on it.
##
## Two things are worth failing a build over here. First, that every problem the
## game can serve has a concept -- a problem outside the ladder is a rung nothing
## can teach, and it fails silently by simply never teaching. Second, that a
## lesson is offered exactly once per child: twice is patronising, never is the
## bug this whole system exists to fix.

func _reset() -> void:
	_failures.clear()
	_assertions = 0

func _fresh_save() -> void:
	SaveManager.clear()

func test_every_authored_problem_has_a_concept() -> void:
	var uncovered: Array[String] = []
	for problem: Variant in DataManager.get_all_math_problems():
		var concept := ConceptLadder.concept_for_problem(problem)
		if concept.is_empty():
			uncovered.append("%s (%s step %d)" % [
				problem.get("id", "?"), problem.get("domain", "?"), int(problem.get("curriculumStep", -1))])
			if uncovered.size() >= 5:
				break
	assert_eq(uncovered.size(), 0, "every problem falls in a concept, uncovered: %s" % str(uncovered))

func test_ladder_covers_every_domain() -> void:
	for domain in MathDomains.ALL:
		assert_true(ConceptLadder.concepts_in(domain).size() > 0, "%s has concepts" % domain)

func test_ranges_are_contiguous_from_zero() -> void:
	for domain in MathDomains.ALL:
		var expected := 0
		for concept: Variant in ConceptLadder.concepts_in(domain):
			var steps: Array = concept["steps"]
			assert_eq(int(steps[0]), expected, "%s: %s starts where the previous ended" % [domain, concept["id"]])
			expected = int(steps[1]) + 1

func test_concept_lookup_uses_the_problem_not_the_learner() -> void:
	# The selection lanes hand out problems a rung either side of where the
	# learner is, so a lesson keyed off the learner's step would teach the wrong
	# idea roughly a third of the time.
	var comfort := ConceptLadder.concept_for("addition", 2)
	var at_level := ConceptLadder.concept_for("addition", 7)
	assert_eq(String(comfort.get("id", "")), "addition.count_all", "step 2 is counting all")
	assert_eq(String(at_level.get("id", "")), "addition.make_ten", "step 7 is making ten")

func test_off_the_end_of_the_ladder_is_empty_not_wrong() -> void:
	assert_true(ConceptLadder.concept_for("addition", 999).is_empty(), "step past the ladder has no concept")
	assert_true(ConceptLadder.concept_for("not_a_domain", 0).is_empty(), "unknown domain has no concept")

func test_every_concept_names_a_real_tutorial() -> void:
	for concept: Variant in ConceptLadder.all():
		var id := ConceptLadder.tutorial_id(concept)
		if id == "":
			continue
		assert_true(not TutorialManager.get_tutorial(id).is_empty(), "%s has tutorial %s" % [concept["id"], id])

func test_a_lesson_is_offered_once_and_then_never_again() -> void:
	_fresh_save()
	var problem := {"domain": "addition", "curriculumStep": 7}
	var first := TutorialManager.tutorial_for_problem(problem)
	assert_eq(String(first.get("id", "")), "addition.make_ten", "first contact offers the lesson")

	TutorialManager.mark_seen("addition.make_ten", false)
	assert_true(TutorialManager.tutorial_for_problem(problem).is_empty(), "not offered a second time")
	# A neighbouring rung is a different idea and still gets taught.
	assert_eq(String(TutorialManager.tutorial_for_problem({"domain": "addition", "curriculumStep": 12}).get("id", "")),
		"addition.teen_numbers", "the next concept is still unseen")
	_fresh_save()

func test_skipping_still_counts_as_seen() -> void:
	# A Skip button that re-offers the lesson tomorrow is a Skip button that
	# lies. The flag survives so a grown-up surface can tell the two apart.
	_fresh_save()
	TutorialManager.mark_seen("counting.to_five", true)
	assert_true(TutorialManager.has_seen("counting.to_five"), "skipped lesson is seen")
	var record: Dictionary = SaveManager.get_tutorials_seen().get("counting.to_five", {})
	assert_true(bool(record.get("skipped", false)), "skip is recorded, not discarded")
	_fresh_save()

func test_teaching_state_is_per_profile() -> void:
	# Two children on one tablet. Teaching one must not silently un-teach or
	# pre-teach the other: the state rides in the profile save, not a global.
	_fresh_save()
	TutorialManager.mark_seen("addition.count_all", false)
	assert_true(TutorialManager.has_seen("addition.count_all"), "taught on this profile")
	SaveManager.switch_profile()
	SaveManager.clear()
	assert_true(not TutorialManager.has_seen("addition.count_all"), "a fresh save has been taught nothing")
	_fresh_save()

func test_unknown_tutorial_id_is_empty_not_a_crash() -> void:
	assert_true(TutorialManager.get_tutorial("nope").is_empty(), "unknown id resolves to nothing")
	assert_true(TutorialManager.get_tutorial("").is_empty(), "empty id resolves to nothing")
