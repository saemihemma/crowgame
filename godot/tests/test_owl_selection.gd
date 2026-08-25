extends TestCase
## Slice 6: the owl selection pipeline produces valid, constraint-respecting
## problems for a fresh learner (data parity: consumes the unchanged pools).

const OWL_DOMAINS := ["addition", "counting", "pattern_matching", "subtraction", "comparison", "number_sequence"]


func _fresh() -> void:
	ELOManager.initialize(null)
	LearnerStateManager.initialize({"childId": "c", "familyId": "f"}, null, ELOManager.get_stats())
	MathProblemManager.reset_answered()

func _config() -> Dictionary:
	return {"domains": OWL_DOMAINS.duplicate(), "difficultyRange": [1, 2],
		"maxCurriculumStep": 20, "maxOperand": 20, "primaryDomain": "addition"}

func test_owl_selects_valid_problems() -> void:
	_fresh()
	# Fresh learner: only addition & counting are unlocked, both at step 2.
	var allowed := OwlSelection.get_allowed_owl_domains(_config())
	assert_true(allowed.has("addition"), "addition unlocked")
	assert_true(allowed.has("counting"), "counting unlocked")
	assert_true(not allowed.has("subtraction"), "subtraction locked for fresh learner")

	var prev: Variant = null
	for i in 12:
		var p = OwlSelection.select_owl_problem(MathProblemManager, _config(), prev)
		assert_true(p != null, "problem selected (iter %d)" % i)
		if p == null:
			continue
		assert_true(allowed.has(p["domain"]), "domain %s is unlocked" % p["domain"])
		assert_true(int(p["curriculumStep"]) <= 2, "curriculum step <= current (got %d)" % int(p["curriculumStep"]))
		var traits: Dictionary = p.get("difficultyTraits", {})
		if traits.has("maxOperand"):
			assert_true(int(traits["maxOperand"]) <= 20, "maxOperand <= 20")
		prev = p["domain"]

func test_get_next_problem_respects_domain_filter() -> void:
	_fresh()
	var p = MathProblemManager.get_next_problem({"domains": ["addition"], "maxCurriculumStep": 2})
	assert_true(p != null, "addition problem found")
	if p != null:
		assert_eq(String(p["domain"]), "addition", "domain filtered")
		assert_true(int(p["curriculumStep"]) <= 2, "step capped")

func test_anti_repeat_window() -> void:
	_fresh()
	# Selecting many problems should not immediately repeat ids within the window.
	var seen: Array = []
	for i in 8:
		var p = MathProblemManager.get_next_problem({"domains": ["addition"], "maxCurriculumStep": 2})
		if p == null:
			break
		var id := String(p["id"])
		assert_true(not seen.has(id), "no repeat within recent window: %s" % id)
		seen.append(id)
