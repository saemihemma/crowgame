extends TestCase
## How difficulty comes back down — and, just as importantly, that a child can
## still climb back up.
##
## Two independent demotion triggers live in `_apply_curriculum_progress`, and
## both are only ever evaluated on a wrong answer:
##
##   1. wrong_count >= DEMOTION_WRONG_THRESHOLD (2) within the last 5 attempts
##   2. confidence_offset <= DEMOTION_CONFIDENCE_THRESHOLD (-25.0)
##
## These tests exist because this exact code path had a downward ratchet, fixed in
## "Make math difficulty actually progress" (#5), and nothing in the suite would
## have caught a regression back to it. The ratchet had four interlocking parts:
##
##   - a miss set confidence to exactly -15.0 and the gate was `<= -15.0`, so ONE
##     miss on any lane — including a deliberately easier comfort problem —
##     demoted immediately;
##   - demotion was evaluated on every attempt, so a single miss sitting in the
##     5-attempt window demoted again on each following answer;
##   - promotion needed 5 first-attempt wins at >=90% accuracy, roughly 20
##     attempts away, so the two rates were wildly mismatched;
##   - demotion left confidence pinned at the floor, so the next miss re-demoted.
##
## Each assertion below pins one of those. If one starts failing, someone has
## moved a constant back — check that it was deliberate before re-baselining.
##
## The same constants are asserted against the reference kernel by
## tools/validate_docs.js, so the two implementations cannot drift apart quietly.
## See docs/PREMORTEM_PUBLIC_LAUNCH.md, Story 3.

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

func test_one_miss_does_not_demote() -> void:
	# The core of the ratchet fix. A fresh offset of 0 becomes 0 * 0.8 - 15 =
	# -15.0 on a miss, which must NOT reach the -25.0 gate.
	_fresh_learner("dem-single")
	var start := LearnerStateManager.get_current_step("addition")
	if start == 0:
		return  # nothing to fall from; the floor is already 0
	LearnerStateManager.record_attempt(_attempt(false, "comfort", start))
	assert_eq(LearnerStateManager.get_current_step("addition"), start,
		"a single miss must not lower the step")

func test_two_misses_in_the_window_demote() -> void:
	# The product principle still has to hold: repeated failure makes the next
	# question easier. Two misses inside the 5-attempt window trips trigger 1.
	_fresh_learner("dem-two")
	var start := LearnerStateManager.get_current_step("addition")
	if start == 0:
		return
	LearnerStateManager.record_attempt(_attempt(false, "at_level", start))
	LearnerStateManager.record_attempt(_attempt(false, "at_level", start))
	assert_true(LearnerStateManager.get_current_step("addition") < start,
		"two misses in the window must lower difficulty")

func test_demotion_is_evaluated_only_on_the_wrong_answer() -> void:
	# Before the fix, a miss still sitting in the 5-attempt window demoted again
	# on each following attempt — so one bad answer cost several steps. Correct
	# answers after a miss must not demote at all.
	_fresh_learner("dem-once")
	var start := LearnerStateManager.get_current_step("addition")
	if start == 0:
		return
	LearnerStateManager.record_attempt(_attempt(false, "at_level", start))
	LearnerStateManager.record_attempt(_attempt(false, "at_level", start))
	var after_demote := LearnerStateManager.get_current_step("addition")
	for _i in range(3):
		LearnerStateManager.record_attempt(
			_attempt(true, "at_level", LearnerStateManager.get_current_step("addition")))
	assert_true(LearnerStateManager.get_current_step("addition") >= after_demote,
		"correct answers after a miss must never demote further")

func test_confidence_is_lifted_clear_of_the_gate_on_demotion() -> void:
	# POST_DEMOTION_CONFIDENCE_FLOOR. Without it, confidence stayed at the floor
	# and the very next miss re-demoted instantly.
	_fresh_learner("dem-floor")
	var start := LearnerStateManager.get_current_step("addition")
	if start == 0:
		return
	LearnerStateManager.record_attempt(_attempt(false, "at_level", start))
	LearnerStateManager.record_attempt(_attempt(false, "at_level", start))
	var offset := float(LearnerStateManager.get_snapshot()["confidenceOffsets"]["addition"])
	assert_true(offset >= -10.0,
		"confidence must be lifted to the post-demotion floor, not left at the gate")

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
	assert_true(after_miss <= -15.0, "a miss drops confidence hard")
	assert_true(after_win > after_miss, "a win recovers some of it")
	assert_true(after_win < 0.0, "but one win does not undo one miss")
