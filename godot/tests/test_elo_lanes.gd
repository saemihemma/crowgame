extends TestCase
## The ELO-aware lane selector actually RUNS.
##
## This file exists because of a bug that nothing caught for four commits, and
## the way it hid is the whole lesson.
##
## A code-reduction pass deleted LearnerStateManager.get_effective_selection_elo
## as dead. It had exactly one caller -- elo_aware_strategy.gd line 55 -- so from
## then on every ELOAwareStrategy.select() aborted mid-function with "Invalid
## call. Nonexistent function", returned null, and the owl fell through to the
## random step-capped fallback for every single problem a child was ever served.
## The whole lane policy (40% comfort, 20% review, 30% at-level, 10% stretch) was
## dead, and the review queue -- the SRS that decides when a child sees a missed
## fact again -- never ran once.
##
## Nothing went red. The existing owl probe still passed, because the fallback
## path does return a problem and the probe asserts that a problem arrives. The
## engine printed SCRIPT ERROR into the probe's own stdout and the suite reported
## "236 passed, 0 failed" underneath it.
##
## So these tests assert on the MECHANISM, not on the outcome: that a problem
## came from a named lane, and that the strategy reports which one. An assertion
## that only checks "a problem arrived" cannot tell the lane system from its own
## corpse.

const OWL_DOMAINS := ["addition", "counting", "pattern_matching", "subtraction", "comparison", "number_sequence"]

func _fresh() -> void:
	ELOManager.initialize(null)
	LearnerStateManager.initialize({"childId": "c", "familyId": "f"}, null, ELOManager.get_stats())
	MathProblemManager.reset_answered()

func _constraints() -> Dictionary:
	return {"difficultyRange": [1, 2], "maxCurriculumStep": 20, "maxOperand": 20}

## The regression itself: select() must complete and name its lane.
##
## `_last_meta` is the tell. An aborted call leaves it at whatever the previous
## call set -- or null on the first -- so asserting that it names one of the four
## lanes after each selection is what distinguishes "the selector ran" from "the
## selector threw and something else served the problem".
func test_elo_aware_strategy_reports_a_lane() -> void:
	_fresh()
	var strategy := ELOAwareStrategy.new(MathProblemManager.get_pool_manager())
	var lanes_seen := {}
	for i in 20:
		var problem: Variant = strategy.select("addition", [], _constraints())
		assert_true(problem != null, "lane selector returned a problem (iter %d)" % i)
		var meta: Variant = strategy.consume_last_selection_meta()
		assert_true(meta is Dictionary, "strategy reported meta (iter %d)" % i)
		if not (meta is Dictionary):
			continue
		var lane := String((meta as Dictionary).get("lane", ""))
		assert_true(lane in ["comfort", "review", "at_level", "stretch"],
			"lane is one of the four, got '%s' (iter %d)" % [lane, i])
		lanes_seen[lane] = true
	# Over twenty draws at a fresh learner's rung the weights should produce more
	# than one lane. Not a distribution assertion -- that would be flaky -- just
	# proof the lane choice is live rather than one constant.
	assert_true(lanes_seen.size() >= 2,
		"more than one lane used over 20 draws, got %s" % [lanes_seen.keys()])

## The function whose deletion caused it, asserted directly.
##
## Cheap, and it fails with a clear name rather than as a mystery in whatever
## calls it next. get_effective_selection_elo is mastery ELO plus the confidence
## offset, so for a fresh learner it is the starting ELO exactly.
func test_effective_selection_elo_exists_and_composes() -> void:
	_fresh()
	var elo := LearnerStateManager.get_effective_selection_elo("addition")
	assert_true(elo > 0.0, "effective selection ELO is a real number, got %f" % elo)
	var expected: float = ELOManager.get_effective_elo("addition") \
		+ LearnerStateManager.get_confidence_offset("addition")
	assert_true(absf(elo - expected) < 0.001,
		"effective ELO = mastery + confidence offset (%f vs %f)" % [elo, expected])

## The owl's own path, end to end, must reach the lane selector rather than the
## fallback.
##
## select_owl_problem tries get_next_problem_elo_aware first and only falls back
## to random when it returns null. So if the ELO path is alive, the strategy's
## meta is populated after an owl selection -- and if it is dead, the owl still
## returns a problem and this is the only thing that notices.
func test_owl_path_uses_the_lane_selector() -> void:
	_fresh()
	var config := {
		"domains": OWL_DOMAINS.duplicate(), "difficultyRange": [1, 2],
		"maxCurriculumStep": 20, "maxOperand": 20, "primaryDomain": "addition",
	}
	var problem = OwlSelection.select_owl_problem(MathProblemManager, config, null)
	assert_true(problem != null, "owl served a problem")
	if problem == null:
		return
	# The manager stashes the strategy's meta per problem id when -- and only when
	# -- the ELO path produced it. The random fallback records nothing, so an
	# absent entry is exactly the signature of the bug this file is named after.
	var meta: Variant = MathProblemManager.consume_selection_meta(String(problem["id"]))
	assert_true(meta is Dictionary and String((meta as Dictionary).get("lane", "")) != "",
		"the owl's problem came from a named lane, not the random fallback")
