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
	_stand_on("addition", 7)
	var first := TutorialManager.pending_lesson("addition")
	assert_eq(String(first.get("id", "")), "addition.make_ten",
		"the rung the child stands on owes its lesson")

	TutorialManager.mark_seen("addition.make_ten", false)
	assert_true(TutorialManager.pending_lesson("addition").is_empty(),
		"not offered a second time")
	# Levelling up onto a neighbouring rung is a different idea, and owes again.
	_stand_on("addition", 12)
	assert_eq(String(TutorialManager.pending_lesson("addition").get("id", "")),
		"addition.teen_numbers", "the next concept is still unseen")
	_fresh_save()

## The debt is DERIVED from where the child stands, not remembered from the
## step-up that put them there.
##
## What this replaces: a test that a concept ABOVE the learner is never taught.
## That guard belonged to `tutorial_for_problem`, which decided whether a lesson
## was safe to open in front of a specific PROBLEM -- including a stretch problem
## one rung above the child, which had to be refused so nobody was taught an idea
## they had not earned. Nothing teaches in front of a question any more, so a
## problem's rung decides nothing; the child's own rung does, and it can be
## neither above nor below itself.
##
## Being derived is also what makes the debt survive quitting the game. An
## earlier version held it in a runtime dictionary filled by curriculum_step_up,
## and a child who levelled up and then closed the game was never taught that
## rung at all.
func test_the_debt_is_recomputed_from_where_the_child_stands() -> void:
	_fresh_save()
	_stand_on("addition", 12)
	var owed := String(TutorialManager.pending_lesson("addition").get("id", ""))
	assert_eq(owed, "addition.teen_numbers", "standing on the rung owes its lesson")
	assert_eq(String(TutorialManager.pending_lesson("addition").get("id", "")), owed,
		"and asking again gives the same answer, with no event in between")
	_fresh_save()

## Put the learner on a rung, so a test can pair a problem with a plausible
## reader of it.
func _stand_on(domain: String, step: int) -> void:
	LearnerStateManager.replace_snapshot(
		MathPlacement.place_snapshot(LearnerStateManager.get_snapshot(), domain, step))

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


## The rungs no problem can ever land on.
##
## `subtraction` steps 17-20 and `addition` step 20 hold nothing, and the reason
## is not that nobody authored them: no fact whose operands and result stay
## inside twenty derives onto them at all. Step 21 upward is magnitude-derived,
## so those rungs belong to numbers the owl's cap of 20 drops anyway.
##
## That makes them harmless ONLY because promotion steps over a rung with no
## content, and only while the next rung that HAS content is inside
## `promotionStepScanLimit`. Both halves are asserted here, because "harmless"
## was an assumption until something checked it.
## Measured, not asserted: `npm run math:step-domains` brute-forces every
## derivation and writes reports/math-concepts/emittable-steps.json. That report
## is the authority; this constant is its in-game mirror, and
## tools/validate_math_concepts.mjs fails the build if the two ever disagree.
const IMPOSSIBLE_RUNGS := {
	"addition": [20],
	"subtraction": [17, 18, 19, 20],
	"multiplication": [11],
	"division": [0, 12],
}

func _problems_on(domain: String, step: int) -> int:
	var n := 0
	for problem: Variant in DataManager.get_all_math_problems():
		if String(problem.get("domain", "")) == domain and int(problem.get("curriculumStep", -1)) == step:
			n += 1
	return n

func test_the_impossible_rungs_are_still_empty() -> void:
	# If one of these ever fills, the derivation changed and the declaration in
	# concept_ladder.json is now a lie. The concept guard says so too; this says
	# it from inside the game.
	for domain: String in IMPOSSIBLE_RUNGS:
		for step: Variant in IMPOSSIBLE_RUNGS[domain]:
			assert_eq(_problems_on(domain, int(step)), 0,
				"%s step %d is structurally unreachable and still empty" % [domain, int(step)])

func test_promotion_can_step_over_every_impossible_rung() -> void:
	var tuning: Dictionary = DataManager.get_dict("MATH_TUNING").get("ladder", {})
	var scan := int(tuning.get("promotionStepScanLimit", 20))
	assert_true(scan > 0, "there is a scan limit to test against")
	for domain: String in IMPOSSIBLE_RUNGS:
		var holes: Array = IMPOSSIBLE_RUNGS[domain]
		# Every hole is checked on its own, not just the first. Division's holes
		# are 0 and 12 -- not contiguous -- so testing only the first would have
		# left step 12 unasserted.
		for hole: Variant in holes:
			var from: int = int(hole) - 1
			# The rung a child sits on before the hole must have somewhere to go.
			var landed := -1
			for step in range(from + 1, from + scan + 1):
				if _problems_on(domain, step) > 0:
					landed = step
					break
			assert_true(landed > from,
				"%s promotion from step %d finds content within %d steps (landed on %d)" % [domain, from, scan, landed])
			# And it must clear the hole, not stop inside it.
			assert_true(not holes.has(landed),
				"%s promotion from step %d clears the hole, landing on %d" % [domain, from, landed])


## Relational shapes across both operations.
##
## Six overlays now claim problems by the position of the unknown rather than by
## difficulty. The thing worth failing a build over is that a problem lands on
## the overlay that teaches ITS shape: "12 - ? = 5" and "? - 3 = 9" derive onto
## nearby rungs and would otherwise both get the take-away lesson, which teaches
## neither of them.
const RELATIONAL_SHAPES := {
	"missing_addend": "addition.missing_part",
	"relational_equals": "addition.balance",
	"both_sides_equals": "addition.both_sides",
	"missing_subtrahend": "subtraction.missing_part",
	"missing_minuend": "subtraction.start_unknown",
	"subtraction_relational": "subtraction.balance",
}

func test_every_relational_shape_reaches_its_own_lesson() -> void:
	var counted := {}
	for problem: Variant in DataManager.get_all_math_problems():
		for skill: Variant in problem.get("skills", []):
			if not RELATIONAL_SHAPES.has(skill):
				continue
			counted[skill] = int(counted.get(skill, 0)) + 1
			var concept := ConceptLadder.concept_for_problem(problem)
			assert_eq(String(concept.get("id", "")), String(RELATIONAL_SHAPES[skill]),
				"%s (%s) reaches its own lesson" % [problem.get("id", "?"), problem.get("prompt", {}).get("text", "")])
	for skill: Variant in RELATIONAL_SHAPES:
		assert_true(int(counted.get(skill, 0)) >= 6,
			"%s has enough authored problems to practise (%d)" % [skill, int(counted.get(skill, 0))])

func test_every_relational_problem_is_inside_the_owl_cap() -> void:
	# These exist to be PLAYED. Six concepts in this pack already teach content no
	# child can reach; the relational ones must not join them.
	for problem: Variant in DataManager.get_all_math_problems():
		var is_relational := false
		for skill: Variant in problem.get("skills", []):
			if RELATIONAL_SHAPES.has(skill):
				is_relational = true
		if not is_relational:
			continue
		var operand := int((problem.get("difficultyTraits", {}) as Dictionary).get("maxOperand", 0))
		assert_true(operand <= 20, "%s has maxOperand %d, inside the owl's cap" % [problem.get("id", "?"), operand])
