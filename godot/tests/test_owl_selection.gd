extends TestCase
## Slice 6: the owl selection pipeline produces valid, constraint-respecting
## problems for a fresh learner (data parity: consumes the unchanged pools).

const OWL_DOMAINS := ["addition", "counting", "pattern_matching", "subtraction", "comparison", "number_sequence"]

## Clear the case's own tally so a long test that loops can assert per iteration
## without every iteration counting again. Deleted once as uncalled, and four
## tests were written against it on another branch in the meantime.
func _reset() -> void:
	_failures.clear()
	_assertions = 0

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

## The owl asks about whatever the child has practised least recently.
##
## This is the in-game half of the parity pair with owlSelection.ts. The rule it
## replaced was `allowed[0]` -- the first entry of the owl's problemTypes list,
## which is addition for every owl and every child -- so addition took roughly
## seven of every ten problems and a domain a child had EARNED could go unserved
## indefinitely. tools/sim_learner_journey.ts measures that from the outside;
## this pins the decision itself.
func test_primary_domain_is_the_least_recently_practised() -> void:
	_reset()
	var allowed := ["addition", "subtraction", "counting"]
	var flat := {"addition": 1.0, "subtraction": 1.0, "counting": 1.0}
	# Addition just answered, counting eight questions ago: counting is due.
	var recent := ["counting", "subtraction", "addition", "subtraction", "addition"]
	assert_eq(OwlSelection.pick_primary_domain(allowed, recent, flat), "counting",
		"the stalest domain is the one that comes next")

func test_a_domain_never_served_is_offered_first() -> void:
	_reset()
	var allowed := ["addition", "division"]
	var recent := ["addition", "addition", "addition"]
	# Division has never appeared, so it is maximally stale. This is what closes
	# the gap between earning a domain and being given it.
	assert_eq(OwlSelection.pick_primary_domain(allowed, recent, {"addition": 3.0, "division": 1.0}),
		"division", "a domain a child has never met outranks any weight")

func test_weights_decide_how_often_a_subject_comes_round() -> void:
	_reset()
	var allowed := ["addition", "pattern_matching"]
	# Both last seen equally long ago; the heavier subject is due first. This is
	# the designer's dial for "how much addition", and it must actually bite.
	var recent := ["addition", "pattern_matching", "x", "y"]
	assert_eq(OwlSelection.pick_primary_domain(allowed, recent, {"addition": 3.0, "pattern_matching": 1.0}),
		"addition", "a heavier subject comes due sooner at equal staleness")

## Unlocking a domain reads that domain's OWN history, not its share of a window.
##
## Under the old rule a prerequisite had to fill half of a 40-deep buffer shared
## by every domain, so nothing behind counting or multiplication could ever open.
func test_unlock_reads_the_prerequisites_own_history() -> void:
	_reset()
	_fresh()
	assert_true(not LearnerStateManager.is_domain_unlocked("pattern_matching"),
		"pattern_matching starts locked behind counting")
	# Twenty clean counting answers, with plenty of other domains interleaved --
	# far more than a 40-deep shared window would ever hold for counting alone.
	for i in 40:
		var domain := "counting" if i % 2 == 0 else "addition"
		LearnerStateManager.record_attempt({
			"attemptId": "t-%d" % i, "childId": "c", "familyId": "f",
			"problemId": "p-%d" % i, "domain": domain, "skills": [],
			"correct": true, "firstAttempt": true, "hintsUsed": 0, "responseMs": 3000,
			"problemELO": 300, "curriculumStep": 0, "selectionLane": "at_level",
			"reviewItemId": null, "answeredAt": "2026-01-01T00:00:00.000Z",
		})
	assert_true(LearnerStateManager.is_domain_unlocked("pattern_matching"),
		"twenty clean counting answers unlock pattern_matching however they were interleaved")

## Where the owl aims inside a lane.
##
## THIS METHOD DID NOT EXIST. elo_aware_strategy.gd called it on every ELO-aware
## selection, so every pick printed "Nonexistent function
## 'get_effective_selection_elo'" and handed the softmax a null target -- 46 of
## those in one pass of this suite, all green, because a SCRIPT ERROR is not a
## test failure. math_tuning.json's withinLaneEloSpread comment describes aiming
## that was not happening.
##
## The two terms are the point: mastery moves over a child's whole history, the
## confidence offset moves within a session, and it is the second one that gets a
## child who has just missed three an easier question off the same rung.
func test_the_selection_target_is_mastery_plus_this_session() -> void:
	_fresh()
	var domain := "addition"
	var mastery: float = ELOManager.get_effective_elo(domain)
	var offset: float = LearnerStateManager.get_confidence_offset(domain)
	assert_almost_eq(LearnerStateManager.get_effective_selection_elo(domain), mastery + offset, 0.001,
		"the aim is lifetime mastery plus how the child is doing right now")
	# And it moves with the session, or the second term is decoration.
	LearnerStateManager.record_attempt({
		"attemptId": "aim-1",
		"problemId": "p-addition-1",
		"domain": domain,
		"correct": false,
		"firstAttempt": false,
		"hintsUsed": 0,
		"responseMs": 1200,
		"problemELO": 150,
		"curriculumStep": LearnerStateManager.get_current_step(domain),
		"selectionLane": "at_level",
		"skills": [domain],
		"answeredAt": Time.get_unix_time_from_system() * 1000.0,
	})
	var after: float = LearnerStateManager.get_effective_selection_elo(domain)
	assert_true(after != mastery + offset,
		"a wrong answer moves where the next question is aimed (still %.1f)" % after)
