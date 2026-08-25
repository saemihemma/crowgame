extends Node
## MathProblemManager — Godot port of math-kernel/math/MathProblemManager.ts. Autoload.
## Owns the merged problem list, recent-id/replay-key anti-repeat windows, the
## ProblemPoolManager + ELOAwareStrategy, and selection metadata. Initialized
## from DataManager's four pools.

const MAX_RECENT_PROBLEM_IDS := 12
const MAX_RECENT_REPLAY_KEYS := 18

var _all_problems: Array = []
var _recent_problem_ids: Array = []
var _recent_replay_keys: Array = []
var _pool: ProblemPoolManager
var _elo_strategy: ELOAwareStrategy
var _selection_meta: Dictionary = {}  # problemId -> { lane, reviewItemId }

func _ready() -> void:
	init_from_data()

func init_from_data() -> void:
	_all_problems = DataManager.get_all_math_problems()
	_pool = ProblemPoolManager.new()
	_pool.initialize(_all_problems)
	_elo_strategy = ELOAwareStrategy.new(_pool)

func mark_answered(problem_id: String) -> void:
	_recent_problem_ids.append(problem_id)
	_recent_problem_ids = _tail(_recent_problem_ids, MAX_RECENT_PROBLEM_IDS)
	var problem: Variant = _find_problem(problem_id)
	if problem == null:
		return
	_recent_replay_keys.append(ProblemReplayKey.build(problem))
	_recent_replay_keys = _tail(_recent_replay_keys, MAX_RECENT_REPLAY_KEYS)

func reset_answered() -> void:
	_recent_problem_ids = []
	_recent_replay_keys = []

func hydrate_recent_problems(problem_ids: Array) -> void:
	_recent_problem_ids = _tail(problem_ids.duplicate(), MAX_RECENT_PROBLEM_IDS)
	var keys: Array = []
	for pid in _recent_problem_ids:
		var p: Variant = _find_problem(String(pid))
		if p != null:
			keys.append(ProblemReplayKey.build(p))
	_recent_replay_keys = _tail(keys, MAX_RECENT_REPLAY_KEYS)

func get_next_problem(filter: Dictionary = {}) -> Variant:
	var candidates: Array = []
	for p in _all_problems:
		if _recent_problem_ids.has(String(p.get("id", ""))):
			continue
		if _recent_replay_keys.has(ProblemReplayKey.build(p)):
			continue
		if filter.has("domains") and (filter["domains"] as Array).size() > 0 and not (filter["domains"] as Array).has(p.get("domain", "")):
			continue
		if filter.has("skills") and (filter["skills"] as Array).size() > 0 and not _has_any_skill(p, filter["skills"]):
			continue
		if filter.has("difficultyRange"):
			var dr: Array = filter["difficultyRange"]
			var d := float(p.get("difficulty", 1.0))
			if d < float(dr[0]) or d > float(dr[1]):
				continue
		if filter.has("maxCurriculumStep") and int(p.get("curriculumStep", 0)) > int(filter["maxCurriculumStep"]):
			continue
		if filter.has("maxOperand"):
			var traits: Dictionary = p.get("difficultyTraits", {})
			if traits.has("maxOperand") and int(traits["maxOperand"]) > int(filter["maxOperand"]):
				continue
		candidates.append(p)

	if candidates.is_empty():
		if _recent_problem_ids.size() > 0 or _recent_replay_keys.size() > 0:
			reset_answered()
			return get_next_problem(filter)
		return null

	var selected: Dictionary = candidates[randi() % candidates.size()]
	mark_answered(String(selected.get("id", "")))
	return selected

## ELO-aware selection. `domains` may be a single String or an Array of domains.
func get_next_problem_elo_aware(domains: Variant, options: Dictionary = {}) -> Variant:
	if domains is Array:
		var arr: Array = domains
		if arr.is_empty():
			return null
		var allowed := _filter_unlocked(arr)
		var ordered := _build_domain_attempt_order(allowed, options.get("primaryDomain", arr[0]))
		for d in ordered:
			var sel = get_next_problem_elo_aware(d, options)
			if sel != null:
				return sel
		return null

	var domain := String(domains)
	if _elo_strategy == null:
		return get_next_problem(_build_domain_filter(domain, options))

	var exclude_ids := _recent_problem_ids.duplicate()
	var constraints := options.duplicate(true)
	var excluded_keys := _recent_replay_keys.duplicate()
	excluded_keys.append_array(options.get("excludedReplayKeys", []))
	constraints["excludedReplayKeys"] = excluded_keys
	var problem = _elo_strategy.select(domain, exclude_ids, constraints)

	if problem != null:
		mark_answered(String(problem.get("id", "")))
		var meta = _elo_strategy.consume_last_selection_meta()
		_selection_meta[String(problem.get("id", ""))] = meta if meta != null else {"lane": "comfort", "reviewItemId": null}
	elif _recent_problem_ids.size() > 0 or _recent_replay_keys.size() > 0:
		reset_answered()
		return get_next_problem_elo_aware(domain, options)
	return problem

func get_pool_manager() -> ProblemPoolManager:
	return _pool

func consume_selection_meta(problem_id: String) -> Variant:
	var meta = _selection_meta.get(problem_id, null)
	_selection_meta.erase(problem_id)
	return meta

func get_total_count() -> int:
	return _all_problems.size()

func get_answered_count() -> int:
	return _recent_problem_ids.size()

# ─── internals ────────────────────────────────────────────
func _filter_unlocked(domains: Array) -> Array:
	var allowed: Array = []
	for d in domains:
		if LearnerStateManager.is_domain_unlocked(String(d)):
			allowed.append(d)
	if allowed.is_empty():
		allowed = ["addition"] if domains.has("addition") else [domains[0]]
	return allowed

func _build_domain_attempt_order(domains: Array, primary: Variant) -> Array:
	var ordered := domains.duplicate()
	var preferred = primary if (primary != null and ordered.has(primary)) else ordered[0]
	var alternates: Array = []
	for d in ordered:
		if d != preferred:
			alternates.append(d)
	if alternates.is_empty():
		return [preferred]
	if randf() < 0.7:
		var out := [preferred]
		out.append_array(alternates)
		return out
	alternates.shuffle()
	var out2 := [alternates[0], preferred]
	out2.append_array(alternates.slice(1))
	return out2

func _build_domain_filter(domain: String, options: Dictionary) -> Dictionary:
	var current_cap := LearnerStateManager.get_current_step(domain)
	var cap := current_cap
	if options.has("maxCurriculumStep"):
		cap = mini(int(options["maxCurriculumStep"]), current_cap)
	var filter := {"domains": [domain], "maxCurriculumStep": cap}
	if options.has("difficultyRange"):
		filter["difficultyRange"] = options["difficultyRange"]
	if options.has("maxOperand"):
		filter["maxOperand"] = options["maxOperand"]
	return filter

func _has_any_skill(problem: Dictionary, skills: Array) -> bool:
	for s in problem.get("skills", []):
		if skills.has(s):
			return true
	return false

func _find_problem(problem_id: String) -> Variant:
	for p in _all_problems:
		if String(p.get("id", "")) == problem_id:
			return p
	return null

func _tail(arr: Array, n: int) -> Array:
	if arr.size() <= n:
		return arr
	return arr.slice(arr.size() - n, arr.size())
