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


## Overlays: concepts that claim problems by SHAPE rather than by difficulty.
##
## The bug these exist to prevent is silent and bad: "5 + ? = 8" derives onto the
## same rung as "5 + 3 = 8", correctly, because it is the same bond. On step
## alone the child would then be handed the make-ten lesson, which teaches
## nothing about where an unknown is allowed to sit.

func test_an_overlay_beats_the_step_range_for_the_shape_it_claims() -> void:
	var relational := {"domain": "addition", "curriculumStep": 4, "skills": ["missing_addend"]}
	assert_eq(String(ConceptLadder.concept_for_problem(relational).get("id", "")),
		"addition.missing_part", "a missing-addend problem gets the missing-part lesson")

	# Same domain, same step, ordinary shape: still the rung.
	var ordinary := {"domain": "addition", "curriculumStep": 4, "skills": ["basic_addition"]}
	assert_eq(String(ConceptLadder.concept_for_problem(ordinary).get("id", "")),
		"addition.count_on", "an ordinary problem on the same step keeps its rung")

func test_relational_equals_and_missing_addend_are_different_lessons() -> void:
	var balance := {"domain": "addition", "curriculumStep": 4, "skills": ["relational_equals"]}
	assert_eq(String(ConceptLadder.concept_for_problem(balance).get("id", "")),
		"addition.balance", "writing the whole first is its own idea")

func test_a_step_alone_can_never_select_an_overlay() -> void:
	# concept_for() has no problem to match on, so it must only ever answer with
	# a rung -- otherwise the domain-first-contact path could open with a lesson
	# about a shape the child has not been given.
	for step in range(0, 37):
		var found := ConceptLadder.concept_for("addition", step)
		assert_true(not found.has("requires"), "step %d resolves to a rung, not an overlay" % step)

func test_overlays_stay_out_of_the_rung_sequence() -> void:
	# test_ranges_are_contiguous_from_zero above walks concepts_in(); an overlay
	# leaking into that list would read as a contiguity break.
	for domain in MathDomains.ALL:
		for concept: Variant in ConceptLadder.concepts_in(domain):
			assert_true(not concept.has("requires"), "%s rung list excludes overlays" % domain)

func test_every_authored_relational_problem_resolves_to_its_overlay() -> void:
	var seen := 0
	for problem: Variant in DataManager.get_all_math_problems():
		var skills: Array = problem.get("skills", [])
		if not (skills.has("missing_addend") or skills.has("relational_equals")):
			continue
		seen += 1
		var concept := ConceptLadder.concept_for_problem(problem)
		assert_true(concept.has("requires"),
			"%s resolves to an overlay, not a rung" % problem.get("id", "?"))
	assert_true(seen >= 20, "the relational problems are actually in the pools (found %d)" % seen)

func test_the_owl_can_actually_serve_a_relational_problem() -> void:
	# The reachability proof. Four lessons in this pack teach content no child can
	# reach because of the operand cap; these must not become the fifth and sixth.
	ELOManager.initialize(null)
	LearnerStateManager.initialize({"childId": "c", "familyId": "f"}, null, ELOManager.get_stats())
	MathProblemManager.reset_answered()
	var reachable := 0
	for problem: Variant in DataManager.get_all_math_problems():
		var skills: Array = problem.get("skills", [])
		if not (skills.has("missing_addend") or skills.has("relational_equals")):
			continue
		var traits: Dictionary = problem.get("difficultyTraits", {})
		var operand := int(traits.get("maxOperand", 0))
		# The owl's own two rails: the operand cap, and the step cap from the
		# learner's current rung. A fresh profile starts addition at step 2.
		if operand <= 20 and int(problem.get("curriculumStep", 99)) <= 2:
			reachable += 1
	assert_true(reachable > 0,
		"a fresh learner can be served at least one relational problem (found %d)" % reachable)
