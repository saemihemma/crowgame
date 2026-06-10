extends Node
## ELOUpdateManager — Godot port of src/systems/ELOUpdateManager.ts. Autoload.
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
	var first_attempt: bool = data.get("firstAttempt", false)
	var actual_score := (1.0 if first_attempt else 0.5) if correct else 0.0

	ELOManager.update_rating(String(_domain), float(_problem_elo), actual_score)

	var pool: ProblemPoolManager = MathProblemManager.get_pool_manager()
	if pool != null:
		pool.update_problem_rating(String(data.get("problemId", _problem_id)), correct)

	var attempt := _build_attempt(data)
	LearnerStateManager.record_attempt(attempt)
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
	}

func _clear_context() -> void:
	_domain = null
	_problem_id = ""
	_problem_elo = null
	_curriculum_step = 0
	_skills = []
	_selection_lane = "comfort"
	_review_item_id = null
