extends RefCounted
class_name ProblemPoolManager
## Godot port of math-kernel/math/ProblemPoolManager.ts.
## Organizes problems by domain, assigns static difficulty->ELO, tracks
## per-problem attempt/success telemetry, and filters candidates by ELO/step
## range plus common constraints (exclude ids, difficulty, maxStep, maxOperand,
## excluded replay keys).

var _problems_by_domain: Dictionary = {}      # domain -> Array[problem]
var _ratings: Dictionary = {}                 # problemId -> { problemId, eloRating, attempts, successRate }

func initialize(all_problems: Array) -> void:
	_problems_by_domain.clear()
	_ratings.clear()
	for problem in all_problems:
		var domain := String(problem.get("domain", ""))
		if not _problems_by_domain.has(domain):
			_problems_by_domain[domain] = []
		_problems_by_domain[domain].append(problem)
		var elo := _assign_initial_elo(problem)
		_ratings[String(problem.get("id", ""))] = {
			"problemId": problem.get("id", ""),
			"eloRating": elo,
			"attempts": 0,
			"successRate": 0.0,
		}

func _assign_initial_elo(problem: Dictionary) -> int:
	var min_elo := 100.0
	var max_elo := 1100.0
	var min_d := 1.0
	var max_d := 5.0
	var clamped: float = maxf(min_d, minf(max_d, float(problem.get("difficulty", 1.0))))
	var normalized := (clamped - min_d) / (max_d - min_d)
	return int(round(min_elo + normalized * (max_elo - min_elo)))

func get_problems_in_range(domain: String, min_elo: float, max_elo: float, exclude_ids: Array, constraints: Dictionary = {}) -> Array:
	var out: Array = []
	for problem in get_all_problems_for_domain(domain):
		if not _passes_common_constraints(problem, exclude_ids, constraints):
			continue
		var rating: Dictionary = _ratings.get(String(problem.get("id", "")), {})
		if rating.is_empty():
			continue
		var r := float(rating["eloRating"])
		if r >= min_elo and r <= max_elo:
			out.append(problem)
	return out


func get_problems_in_curriculum_step_range(domain: String, min_step: int, max_step: int, exclude_ids: Array, constraints: Dictionary = {}) -> Array:
	var out: Array = []
	for problem in get_all_problems_for_domain(domain):
		if not _passes_common_constraints(problem, exclude_ids, constraints):
			continue
		var step := int(problem.get("curriculumStep", 0))
		if step >= min_step and step <= max_step:
			out.append(problem)
	return out

func get_problems_by_skills_in_curriculum_step_range(domain: String, skills: Array, min_step: int, max_step: int, exclude_ids: Array, constraints: Dictionary = {}) -> Array:
	if skills.is_empty():
		return get_problems_in_curriculum_step_range(domain, min_step, max_step, exclude_ids, constraints)
	return _filter_by_skills(get_problems_in_curriculum_step_range(domain, min_step, max_step, exclude_ids, constraints), skills)

func get_problem_curriculum_step(problem_id: String) -> int:
	for problems in _problems_by_domain.values():
		for p in problems:
			if String(p.get("id", "")) == problem_id:
				return int(p.get("curriculumStep", 0))
	return 0

func get_problem_elo(problem_id: String) -> int:
	var rating: Dictionary = _ratings.get(problem_id, {})
	return int(rating["eloRating"]) if not rating.is_empty() else 150

## Record what happened on a problem. Attempts and success rate only.
##
## NOT a difficulty update, which is what this was called (`update_problem_rating`)
## for as long as it has existed while never touching `eloRating`. Renamed rather
## than made true, because making it true here is the wrong place: `_ratings` is
## built from scratch by initialize() on every boot and is never saved, and a
## child answers perhaps fifty problems out of 3,736 in a session -- so nearly
## every entry would calibrate from zero or one observation, which is not
## calibration, it is noise with a confident name.
##
## Item difficulty has to be calibrated across children, and the attempts are
## already going somewhere that can: every one is submitted to the API with its
## problem id and outcome. That belongs in the admin analytics beside
## /api/v1/admin/ladder-tuning, not in a per-session map.
func record_problem_outcome(problem_id: String, success: bool) -> void:
	var rating: Dictionary = _ratings.get(problem_id, {})
	if rating.is_empty():
		return
	rating["attempts"] = int(rating["attempts"]) + 1
	var total_successes := float(rating["successRate"]) * (int(rating["attempts"]) - 1)
	var new_successes := total_successes + (1.0 if success else 0.0)
	rating["successRate"] = new_successes / int(rating["attempts"])

func get_all_problems_for_domain(domain: String) -> Array:
	return _problems_by_domain.get(domain, [])


func _filter_by_skills(problems: Array, skills: Array) -> Array:
	var wanted := {}
	for s in skills:
		wanted[s] = true
	var out: Array = []
	for problem in problems:
		for skill in problem.get("skills", []):
			if wanted.has(skill):
				out.append(problem)
				break
	return out

func _passes_common_constraints(problem: Dictionary, exclude_ids: Array, constraints: Dictionary) -> bool:
	if exclude_ids.has(String(problem.get("id", ""))):
		return false
	if constraints.has("difficultyRange"):
		var dr: Array = constraints["difficultyRange"]
		var d := float(problem.get("difficulty", 1.0))
		if d < float(dr[0]) or d > float(dr[1]):
			return false
	if constraints.has("maxCurriculumStep") and int(problem.get("curriculumStep", 0)) > int(constraints["maxCurriculumStep"]):
		return false
	if constraints.has("maxOperand"):
		var traits: Dictionary = problem.get("difficultyTraits", {})
		if traits.has("maxOperand") and int(traits["maxOperand"]) > int(constraints["maxOperand"]):
			return false
	if constraints.has("excludedReplayKeys"):
		if (constraints["excludedReplayKeys"] as Array).has(ProblemReplayKey.build(problem)):
			return false
	return true
