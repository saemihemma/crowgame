extends Node
## ELOUpdateManager — ported from the retired Phaser build; this is now the only implementation. Autoload.
## Bridges completed challenges into the learner model: caches problem context on
## math_problem_presented, then on math_challenge_complete updates mastery ELO,
## per-problem rating, learner state (confidence/review/curriculum), and save.
## Hosted sync stays optional (local-only) until LearnerSyncService lands.

var _domain: Variant = null
var _problem_id := ""
var _problem_elo: Variant = null
var _curriculum_step := 0
var _skills: Array = []
var _selection_lane := "comfort"
var _review_item_id: Variant = null

func _ready() -> void:
	EventBus.math_problem_presented.connect(_on_problem_presented)
	EventBus.math_challenge_complete.connect(_on_challenge_complete)
	# Let the curriculum ladder see which steps actually have problems, so
	# promotion can skip authored holes. A rung needs at least 3 problems to
	# be practicable (promotion requires 3 fresh at-level wins).
	LearnerStateManager.set_step_content_provider(func(domain: String, step: int) -> bool:
		var pool: ProblemPoolManager = MathProblemManager.get_pool_manager()
		if pool == null:
			return true
		return pool.get_problems_in_curriculum_step_range(domain, step, step, []).size() >= 3
	)

func _on_problem_presented(problem: Dictionary) -> void:
	_problem_id = String(problem.get("id", ""))
	_domain = problem.get("domain", null)
	_skills = (problem.get("skills", []) as Array).duplicate()

	var meta = MathProblemManager.consume_selection_meta(_problem_id)
	_selection_lane = String(meta.get("lane", "comfort")) if meta is Dictionary else "comfort"
	_review_item_id = meta.get("reviewItemId", null) if meta is Dictionary else null

	var pool: ProblemPoolManager = MathProblemManager.get_pool_manager()
	if pool != null:
		_problem_elo = pool.get_problem_elo(_problem_id)
		_curriculum_step = pool.get_problem_curriculum_step(_problem_id)

func _on_challenge_complete(data: Dictionary) -> void:
	if _domain == null or _problem_elo == null:
		return
	var correct: bool = data.get("correct", false)
	# The freebie is the first-ever try at a newly taught skill: a win counts
	# normally, a miss is never held against the learner.
	if bool(data.get("freebie", false)) and not correct:
		_clear_context()
		return
	var first_attempt: bool = data.get("firstAttempt", false)
	var actual_score := (1.0 if first_attempt else 0.5) if correct else 0.0

	ELOManager.update_rating(String(_domain), float(_problem_elo), actual_score)

	var pool: ProblemPoolManager = MathProblemManager.get_pool_manager()
	if pool != null:
		pool.record_problem_outcome(String(data.get("problemId", _problem_id)), correct)

	var attempt := _build_attempt(data)
	var step_before: int = LearnerStateManager.get_current_step(String(_domain))
	# Read BEFORE record_attempt, which increments it. The placement window is
	# defined on answers already given, not on this one.
	var calibrating := MathPlacement.is_calibrating(LearnerStateManager.get_lifetime_attempt_count())
	# Comeback: this attempt answers a review item born from a miss. Getting
	# it right now is the redemption story, celebrated harder than a win.
	var is_comeback := false
	if correct and attempt.get("reviewItemId", null) != null:
		for item in LearnerStateManager.get_snapshot()["reviewItems"]:
			if item["id"] == attempt["reviewItemId"] and item.get("lastOutcome", "") == "wrong":
				is_comeback = true
				break
	LearnerStateManager.record_attempt(attempt)
	# THE PLACEMENT WINDOW. For a child's first few answers the ordinary ladder is
	# too slow to be a placement: three first-try wins at 80% accuracy to clear one
	# step, with most questions drawn from at or below the rung they are already on.
	# A seven-year-old seeded slightly low would spend thirty questions climbing out
	# of it, and a four-year-old seeded high would spend as long falling. Inside the
	# window one answer moves one whole concept, either way (MathPlacement), so the
	# birth-year guess is corrected in about three questions -- and the child never
	# sees a test, only owls.
	#
	# Applied AFTER record_attempt, so the attempt is filed against the rung it was
	# actually asked on and the ladder's own promotion runs first. This only ever
	# moves the position.
	if calibrating:
		var domain := String(_domain)
		var placed := MathPlacement.calibrated_step(
			domain, LearnerStateManager.get_current_step(domain), correct, first_attempt)
		LearnerStateManager.replace_snapshot(
			MathPlacement.place_snapshot(LearnerStateManager.get_snapshot(), domain, placed))
	var step_after: int = LearnerStateManager.get_current_step(String(_domain))
	if is_comeback:
		EventBus.math_comeback.emit({"domain": _domain, "skills": attempt["skills"]})
	if step_after > step_before:
		EventBus.curriculum_step_up.emit({"domain": _domain, "step": step_after})
	SaveManager.record_math_attempt({
		"skills": attempt["skills"], "correct": attempt["correct"],
		"hintsUsed": attempt["hintsUsed"], "timeMs": attempt["responseMs"],
		"problemId": attempt["problemId"],
	})
	SaveManager.save()
	LearnerSyncService.submit_attempt(attempt)  # fire-and-forget; local-only when no API base
	_clear_context()

func _build_attempt(data: Dictionary) -> Dictionary:
	var profile = ProfileManager.get_active_profile()
	var child_id := "local-child"
	var family_id := "local-family"
	if profile is Dictionary:
		child_id = String(profile.get("childId", child_id))
		family_id = String(profile.get("familyId", family_id))
	return {
		"attemptId": "attempt-%d-%d" % [int(Time.get_unix_time_from_system() * 1000.0), randi() % 1000000],
		"childId": child_id, "familyId": family_id,
		"problemId": String(data.get("problemId", _problem_id)),
		"domain": _domain, "skills": _skills.duplicate(),
		"correct": data.get("correct", false), "firstAttempt": data.get("firstAttempt", false),
		"hintsUsed": int(data.get("hintsUsed", 0)), "responseMs": int(data.get("responseMs", 0)),
		"answeredAt": int(Time.get_unix_time_from_system() * 1000.0),
		"problemELO": _problem_elo, "curriculumStep": _curriculum_step,
		"selectionLane": _selection_lane, "reviewItemId": _review_item_id,
		"golden": bool(data.get("golden", false)),
	}

func _clear_context() -> void:
	_domain = null
	_problem_id = ""
	_problem_elo = null
	_curriculum_step = 0
	_skills = []
	_selection_lane = "comfort"
	_review_item_id = null
