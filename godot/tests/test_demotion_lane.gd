extends TestCase
## How difficulty comes back down.
##
## These tests document the CURRENT behaviour, including a part of it that may not
## be intended. Read the note on the confidence arm before changing anything here.
##
## There are two independent demotion triggers (`_apply_curriculum_progress`):
##
##   1. wrong_count >= DEMOTION_WRONG_THRESHOLD (2) in the last 5 attempts
##   2. confidence_offset <= -15.0
##
## Trigger 1 counts misses in EVERY lane. Filtering it to at-level misses only was
## tried and reverted: it does fix a real ratchet (only 25% of served problems are
## at the current step, so 5 at-level wins take ~20 attempts while the 5-attempt
## window slides across all of them, and a missed skill is re-served for review
## within 2-4 attempts — inside the window where a second miss demotes), but the
## measured effect in the runtime selector simulation was +1 step in addition and
## subtraction NEVER unlocking. Trading a whole domain for one step of depth is
## the owner's pedagogy call, not a cleanup.
##
## Trigger 2 is the one that actually dominates, and it is worth being explicit
## about: `_apply_confidence_update` sets delta = -15.0 for ANY miss, and a fresh
## offset of 0 becomes 0 * 0.8 - 15 = exactly -15.0. So a SINGLE wrong answer on
## ANY lane — including a deliberately easier comfort problem, or a review item
## the child last saw two attempts ago — demotes the curriculum step immediately.
##
## That is consistent with PROJECT.md ("mistakes should lower difficulty faster
## than success raises it") and it is deliberately kind in the short term. But it
## interacts badly with promotion, which needs 5 at-level wins AND >=90%
## first-attempt accuracy over the last 10: a child who misses roughly one in ten
## can be demoted faster than they can climb, and sit at a low step indefinitely.
## Whether that is the intended pedagogy is a product decision, not a bug to be
## quietly patched, so it is documented here rather than changed.

func _fresh_learner(child_id: String) -> void:
	Persistence.remove_item("crow_learner_snapshot_%s" % child_id)
	LearnerStateManager.initialize({"childId": child_id, "familyId": "fam"}, null, null)

func _attempt(correct: bool, lane: String, step: int) -> Dictionary:
	return {
		"attemptId": "attempt-%d-%s" % [Time.get_ticks_usec(), lane],
		"problemId": "p-addition-%d" % step,
		"domain": "addition",
		"correct": correct,
		"firstAttempt": correct,
		"hintsUsed": 0,
		"responseMs": 1200,
		"problemELO": 150,
		"curriculumStep": step,
		"selectionLane": lane,
		"skills": ["addition"],
		# _apply_curriculum_progress indexes answeredAt directly rather than via
		# .get(), so an attempt without it aborts the whole update. The first draft
		# of this suite omitted it and "passed" while doing nothing at all — which
		# is a good reminder that a green assertion is not the same as a covered
		# code path.
		"answeredAt": Time.get_unix_time_from_system() * 1000.0,
	}

func test_a_single_miss_of_any_lane_demotes_via_confidence() -> void:
	# Documents the dominant trigger. If this ever starts failing, someone changed
	# the confidence arm — check that it was on purpose.
	_fresh_learner("dem-confidence")
	var start := LearnerStateManager.get_current_step("addition")
	if start == 0:
		return  # nothing to fall from
	LearnerStateManager.record_attempt(_attempt(false, "comfort", start))
	assert_true(LearnerStateManager.get_current_step("addition") < start,
		"one miss on an EASIER problem currently lowers the step, via confidence <= -15")

func test_at_level_misses_demote() -> void:
	# The core product principle: repeated failure at the current step must make
	# the next question easier. This is the assertion that must never break.
	_fresh_learner("dem-atlevel")
	var start := LearnerStateManager.get_current_step("addition")
	if start == 0:
		return
	LearnerStateManager.record_attempt(_attempt(false, "at_level", start))
	LearnerStateManager.record_attempt(_attempt(false, "at_level", start))
	assert_true(LearnerStateManager.get_current_step("addition") < start,
		"at-level misses must lower difficulty")

func test_wins_lift_confidence_back_above_the_demotion_line() -> void:
	# The wrong_count arm can only ever be the deciding trigger once confidence has
	# climbed back above -15, so pin that recovery: without it, trigger 2 fires on
	# every single miss forever and trigger 1's threshold is unreachable dead code.
	_fresh_learner("dem-lane")
	for _i in range(6):
		LearnerStateManager.record_attempt(
			_attempt(true, "at_level", LearnerStateManager.get_current_step("addition")))
	var recovered := float(LearnerStateManager.get_snapshot()["confidenceOffsets"]["addition"])
	assert_true(recovered > -15.0, "confidence should be above the demotion line after wins")

func test_confidence_recovers_more_slowly_than_it_drops() -> void:
	# The intended asymmetry, stated as a test so it cannot drift silently:
	# a miss costs -15, a first-attempt win earns +4, on a 0.8 decay.
	_fresh_learner("dem-asym")
	LearnerStateManager.record_attempt(
		_attempt(false, "at_level", LearnerStateManager.get_current_step("addition")))
	var after_miss := float(LearnerStateManager.get_snapshot()["confidenceOffsets"]["addition"])
	LearnerStateManager.record_attempt(
		_attempt(true, "at_level", LearnerStateManager.get_current_step("addition")))
	var after_win := float(LearnerStateManager.get_snapshot()["confidenceOffsets"]["addition"])
	assert_true(after_miss <= -15.0, "a miss drops confidence to the demotion line")
	assert_true(after_win > after_miss, "a win recovers some of it")
	assert_true(after_win < 0.0, "but one win does not undo one miss")
