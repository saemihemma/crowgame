extends RefCounted
class_name ELOAwareStrategy
## Godot port of math-kernel/math/selection/ELOAwareStrategy.ts.
## Lane policy: 40% comfort (step-1), 20% review (step-2..-1, skill-matched),
## 30% at-level (current step), 10% stretch (step+1, only while the learner is
## hot). Empty lanes drop out and remaining weights renormalize in _pick_lane.
## Empty band -> step-down-only fallback. Curriculum steps cap selection at one
## step above current; ELO is a background signal.

var _pool: ProblemPoolManager
var _last_meta: Variant = null  # { lane, reviewItemId } or null

func _init(pool: ProblemPoolManager) -> void:
	_pool = pool

func select(domain: String, exclude_ids: Array, constraints: Dictionary = {}) -> Variant:
	var learner := LearnerStateManager
	var due_review := learner.get_due_review_items(domain)
	var current_step := learner.get_current_step(domain)
	var effective_max_step := current_step
	if constraints.has("maxCurriculumStep"):
		effective_max_step = mini(current_step, int(constraints["maxCurriculumStep"]))

	var comfort_step := maxi(0, effective_max_step - 1)
	var review_min := maxi(0, effective_max_step - 2)
	var review_max := maxi(0, effective_max_step - 1)

	var lane_candidates := {
		"comfort": _wrap(_pool.get_problems_in_curriculum_step_range(domain, comfort_step, comfort_step, exclude_ids, constraints)),
		"review": _build_review_candidates(domain, review_min, review_max, due_review, exclude_ids, constraints),
		"at_level": _wrap(_pool.get_problems_in_curriculum_step_range(domain, effective_max_step, effective_max_step, exclude_ids, constraints)),
		"stretch": _wrap(_pool.get_problems_in_curriculum_step_range(domain, effective_max_step + 1, effective_max_step + 1, exclude_ids, constraints)) if learner.can_use_stretch_lane(domain) else [],
	}

	# Relative shares, not exact odds: empty lanes are dropped below and
	# _pick_lane renormalizes over what remains. The shares live in
	# data/tuning/math_tuning.json, shared byte-identical with the web port.
	var lane_weights: Dictionary = DataManager.get_dict("MATH_TUNING").get("laneWeights", {})

	var available: Array = []
	for lane in ["comfort", "review", "at_level", "stretch"]:
		if (lane_candidates[lane] as Array).size() > 0 and float(lane_weights[lane]) > 0.0:
			available.append(lane)

	if available.is_empty():
		var fallback: Variant = _find_step_down_fallback(domain, effective_max_step, exclude_ids, constraints)
		if fallback == null:
			_last_meta = null
			return null
		_last_meta = {"lane": "comfort", "reviewItemId": null}
		return fallback

	var lane := _pick_lane(available, lane_weights)
	var candidates: Array = lane_candidates[lane]
	var selected: Dictionary = _pick_candidate(candidates, learner.get_effective_selection_elo(domain))
	_last_meta = {"lane": lane, "reviewItemId": selected["reviewItemId"]}
	return selected["problem"]

## Which problem, once the lane is chosen.
##
## This was `candidates[randi() % candidates.size()]`, which is why the effective
## selection ELO this strategy computes was logged and never used: the lane
## decided the rung and then the question came out of a hat. Two problems on the
## same rung are not equally well aimed -- one may sit 200 points off the
## learner's edge -- and nothing preferred the nearer one.
##
## A SOFTMAX, not an argmin, and a deliberately wide one. Always picking the
## nearest candidate would collapse coverage: tools/sim_learner_journey.ts exists
## because a thriving child once saw 335 problems out of 4039, and it holds a
## floor of 450 distinct. So closeness is a lean, not a rule -- every candidate
## on the rung keeps real probability, and the guard is what says whether the
## lean has gone too far.
func _pick_candidate(candidates: Array, target_elo: float) -> Dictionary:
	if candidates.size() == 1:
		return candidates[0]
	var spread := float((DataManager.get_dict("MATH_TUNING").get("selection", {}) as Dictionary)
		.get("withinLaneEloSpread", 0.0))
	if spread <= 0.0:
		return candidates[randi() % candidates.size()]

	var weights: Array = []
	var total := 0.0
	for c in candidates:
		var problem_elo := float(_pool.get_problem_elo(String((c as Dictionary)["problem"].get("id", ""))))
		var w: float = exp(-absf(problem_elo - target_elo) / spread)
		weights.append(w)
		total += w
	if total <= 0.0:
		return candidates[randi() % candidates.size()]

	var roll := randf() * total
	var cumulative := 0.0
	for i in candidates.size():
		cumulative += float(weights[i])
		if roll <= cumulative:
			return candidates[i]
	return candidates[candidates.size() - 1]

func consume_last_selection_meta() -> Variant:
	var m: Variant = _last_meta
	_last_meta = null
	return m

func _wrap(problems: Array) -> Array:
	var out: Array = []
	for p in problems:
		out.append({"problem": p, "reviewItemId": null})
	return out

func _build_review_candidates(domain: String, min_step: int, max_step: int, review_items: Array, exclude_ids: Array, constraints: Dictionary) -> Array:
	var candidates: Array = []
	for item in review_items:
		var matching := _pool.get_problems_by_skills_in_curriculum_step_range(domain, [item["skill"]], min_step, max_step, exclude_ids, constraints)
		for problem in matching:
			candidates.append({"problem": problem, "reviewItemId": item["id"]})
	return candidates

func _find_step_down_fallback(domain: String, max_step: int, exclude_ids: Array, constraints: Dictionary) -> Variant:
	var step := max_step
	while step >= 0:
		var candidates := _pool.get_problems_in_curriculum_step_range(domain, step, step, exclude_ids, constraints)
		if candidates.size() > 0:
			return candidates[randi() % candidates.size()]
		step -= 1
	return null

func _pick_lane(lanes: Array, weights: Dictionary) -> String:
	var total := 0.0
	for lane in lanes:
		total += float(weights[lane])
	var target := randf() * total
	var cumulative := 0.0
	for lane in lanes:
		cumulative += float(weights[lane])
		if target <= cumulative:
			return lane
	return lanes[0]
