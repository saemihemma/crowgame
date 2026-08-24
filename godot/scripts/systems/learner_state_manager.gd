extends Node
## LearnerStateManager — Godot port of math-kernel/systems/LearnerStateManager.ts. Autoload.
##
## Tier-1 exact port of the fast learner signals: per-domain confidence offsets,
## curriculum steps (promotion/demotion), review SRS queue, recent-attempt
## windows, unlock prerequisites, and the derived summary. Constants match the
## source exactly. ELO mastery is read from the ELOManager autoload.

const ALL_MATH_DOMAINS := MathDomains.ALL

const MAX_RECENT_ATTEMPTS := 40
const MAX_RECENT_PROBLEMS := 12
const MAX_BACKLOG_HISTORY := 8
const MAX_STEP_RESULTS := 10
const IMMEDIATE_REVIEW_MIN_GAP := 2
const IMMEDIATE_REVIEW_MAX_GAP := 4
const PROMOTION_WIN_TARGET := 3
const PROMOTION_ACCURACY_TARGET := 0.8
const PROMOTION_ACCURACY_WINDOW := 10
const DEMOTION_WINDOW := 5
const DEMOTION_WRONG_THRESHOLD := 2
const DEMOTION_CONFIDENCE_THRESHOLD := -25.0
const POST_DEMOTION_CONFIDENCE_FLOOR := -10.0
const PROMOTION_STEP_SCAN_LIMIT := 20

const DAY_MS := 86400000  # 24 * 60 * 60 * 1000

const DOMAIN_PREREQUISITES := {
	"addition": [], "subtraction": ["addition"], "multiplication": ["addition"],
	"division": ["multiplication"], "counting": [], "comparison": ["addition"],
	"pattern_matching": ["counting"], "number_sequence": ["addition"],
}

var _snapshot: Dictionary = {}
var _initialized := false
var _id_counter := 0
# Test seam: when non-empty, _get_review_gap() pops from this instead of RNG.
var _review_gap_queue: Array = []
# Pool-backed "does this step have enough problems" check; invalid = fall
# back to blind +1 promotion (mirrors the TS stepContentProvider).
var _step_content_provider := Callable()

func _elo() -> Node:
	return get_node("/root/ELOManager")

func initialize(profile: Variant, saved_state: Variant = null, mastery: Variant = null) -> void:
	var live_mastery: Dictionary = mastery if mastery is Dictionary else _elo().get_stats()
	var child_id := "local-child"
	var family_id := "local-family"
	if profile is Dictionary:
		child_id = String(profile.get("childId", child_id))
		family_id = String(profile.get("familyId", family_id))
	var base := _create_default_snapshot(child_id, family_id, live_mastery)
	var saved: Dictionary = saved_state if saved_state is Dictionary else {}

	var merged := base.duplicate(true)
	for k in saved:
		merged[k] = saved[k]
	merged["childId"] = child_id
	merged["familyId"] = family_id
	merged["mastery"] = live_mastery
	merged["confidenceOffsets"] = _merge_number_map(base["confidenceOffsets"], saved.get("confidenceOffsets", {}))
	merged["curriculumProgress"] = _merge_curriculum_progress(saved.get("curriculumProgress", null))
	merged["reviewItems"] = (saved.get("reviewItems", []) as Array).duplicate(true)
	merged["recentAttempts"] = _slice_tail(saved.get("recentAttempts", []), MAX_RECENT_ATTEMPTS)
	merged["recentProblemIds"] = _slice_tail(saved.get("recentProblemIds", []), MAX_RECENT_PROBLEMS)
	merged["domainHistory"] = _merge_domain_history(saved.get("domainHistory", null))
	merged["unlockState"] = _merge_unlock(base["unlockState"], saved.get("unlockState", {}))
	merged["latestSyncCursor"] = saved.get("latestSyncCursor", null)
	merged["lastSyncedAt"] = saved.get("lastSyncedAt", null)
	merged["syncStatus"] = saved.get("syncStatus", "local-only")
	merged["summary"] = base["summary"]

	_snapshot = merged
	_initialized = true
	reconcile_curriculum_floors()
	_refresh_derived_state()

func is_initialized() -> bool:
	return _initialized

func set_step_content_provider(provider: Callable) -> void:
	_step_content_provider = provider
	reconcile_curriculum_floors()

## Raise any domain whose authored content starts above its stored step, so a
## fresh ladder never points at steps that have no problems.
func reconcile_curriculum_floors() -> void:
	if not _initialized or not _step_content_provider.is_valid():
		return
	for domain in ALL_MATH_DOMAINS:
		var progress: Dictionary = _snapshot["curriculumProgress"][domain]
		var current := int(progress["currentStep"])
		var has_reachable := false
		for step in range(0, current + 1):
			if bool(_step_content_provider.call(domain, step)):
				has_reachable = true
				break
		if has_reachable:
			continue
		for step in range(current + 1, current + PROMOTION_STEP_SCAN_LIMIT + 1):
			if bool(_step_content_provider.call(domain, step)):
				progress["currentStep"] = step
				progress["winsAtCurrentStep"] = 0
				break

func get_snapshot() -> Dictionary:
	if not _initialized:
		initialize(null, null, _elo().get_stats())
	_snapshot["mastery"] = _elo().get_stats()
	_refresh_derived_state()
	return _snapshot.duplicate(true)

func replace_snapshot(snapshot: Dictionary) -> void:
	_snapshot = snapshot.duplicate(true)
	_initialized = true
	_refresh_derived_state()

func update_sync_metadata(status: String, latest_cursor: Variant, last_synced_at: Variant) -> void:
	if not _initialized:
		return
	_snapshot["syncStatus"] = status
	_snapshot["latestSyncCursor"] = latest_cursor
	_snapshot["lastSyncedAt"] = last_synced_at
	_refresh_derived_state()

func get_confidence_offset(domain: String) -> float:
	return float(get_snapshot()["confidenceOffsets"][domain])

func get_effective_selection_elo(domain: String) -> float:
	return _elo().get_effective_elo(domain) + get_confidence_offset(domain)

func get_current_step(domain: String) -> int:
	return int(get_snapshot()["curriculumProgress"][domain]["currentStep"])

func get_wins_at_current_step(domain: String) -> int:
	return int(get_snapshot()["curriculumProgress"][domain]["winsAtCurrentStep"])

func is_domain_unlocked(domain: String) -> bool:
	return bool(get_snapshot()["unlockState"].get(domain, false))

func can_use_stretch_lane(domain: String) -> bool:
	var recent := _get_recent_attempts(domain, 5)
	if recent.size() < 5:
		return false
	var correct := 0
	for a in recent:
		if a["correct"]:
			correct += 1
	var rate := float(correct) / recent.size()
	return rate >= 0.8 and get_confidence_offset(domain) >= 0.0

func get_due_review_items(domain: String = "") -> Array:
	var snapshot := get_snapshot()
	var current_attempt_count := int(snapshot["mastery"]["problemsAttempted"])
	var now := _now_ms()
	var items: Array = []
	for item in snapshot["reviewItems"]:
		if item["stage"] == "graduated":
			continue
		if domain != "" and item["domain"] != domain:
			continue
		var due := false
		if item.get("dueAfterAttempt", null) != null:
			due = current_attempt_count >= int(item["dueAfterAttempt"])
		elif item.get("dueAt", null) != null:
			due = now >= int(item["dueAt"])
		if due:
			items.append(item)
	items.sort_custom(func(a, b):
		var sr := _get_stage_rank(a["stage"]) - _get_stage_rank(b["stage"])
		if sr != 0:
			return sr < 0
		var a_due = a.get("dueAt", null) if a.get("dueAt", null) != null else (a.get("dueAfterAttempt", 0) if a.get("dueAfterAttempt", null) != null else 0)
		var b_due = b.get("dueAt", null) if b.get("dueAt", null) != null else (b.get("dueAfterAttempt", 0) if b.get("dueAfterAttempt", null) != null else 0)
		return int(a_due) < int(b_due))
	return items

func record_attempt(attempt: Dictionary) -> Dictionary:
	if not _initialized:
		initialize(null, null, _elo().get_stats())

	_apply_confidence_update(attempt)
	_apply_review_update(attempt)
	_apply_curriculum_progress(attempt)

	(_snapshot["recentAttempts"] as Array).append(_attempt_record(attempt))
	_snapshot["recentAttempts"] = _slice_tail(_snapshot["recentAttempts"], MAX_RECENT_ATTEMPTS)

	(_snapshot["recentProblemIds"] as Array).append(attempt["problemId"])
	_snapshot["recentProblemIds"] = _slice_tail(_snapshot["recentProblemIds"], MAX_RECENT_PROBLEMS)

	_push_backlog_history(String(attempt["domain"]))
	_refresh_derived_state()
	return get_snapshot()

# ─── internals ────────────────────────────────────────────────

func _attempt_record(attempt: Dictionary) -> Dictionary:
	return {
		"id": attempt.get("attemptId", ""),
		"problemId": attempt.get("problemId", ""),
		"domain": attempt.get("domain", ""),
		"skills": (attempt.get("skills", []) as Array).duplicate(),
		"correct": attempt.get("correct", false),
		"firstAttempt": attempt.get("firstAttempt", false),
		"hintsUsed": attempt.get("hintsUsed", 0),
		"responseMs": attempt.get("responseMs", 0),
		"answeredAt": attempt.get("answeredAt", 0),
		"problemELO": attempt.get("problemELO", 0),
		"curriculumStep": attempt.get("curriculumStep", 0),
		"selectionLane": attempt.get("selectionLane", "comfort"),
		"reviewItemId": attempt.get("reviewItemId", null),
	}

func _apply_confidence_update(attempt: Dictionary) -> void:
	var domain := String(attempt["domain"])
	var current := float(_snapshot["confidenceOffsets"][domain])
	var decayed := current * 0.8
	var delta: float
	if attempt["correct"]:
		delta = 4.0 if attempt["firstAttempt"] else 1.0
	else:
		delta = -15.0
	_snapshot["confidenceOffsets"][domain] = clampf(decayed + delta, -50.0, 20.0)

func _apply_curriculum_progress(attempt: Dictionary) -> void:
	var domain := String(attempt["domain"])
	var progress: Dictionary = _snapshot["curriculumProgress"][domain]
	var step := int(attempt["curriculumStep"])
	(progress["recentStepResults"] as Array).append({
		"step": step, "correct": attempt["correct"],
		"firstAttempt": attempt["firstAttempt"], "answeredAt": attempt["answeredAt"],
	})
	progress["recentStepResults"] = _slice_tail(progress["recentStepResults"], MAX_STEP_RESULTS)

	# Stretch-lane fast path: a first-try win above the current step promotes
	# directly to that step. Never triggers on a wrong or retried answer.
	if step > int(progress["currentStep"]) and attempt["correct"] and attempt["firstAttempt"]:
		progress["currentStep"] = step
		progress["winsAtCurrentStep"] = 0

	if step == int(progress["currentStep"]) and attempt["correct"] and attempt["firstAttempt"]:
		progress["winsAtCurrentStep"] = int(progress["winsAtCurrentStep"]) + 1

	# Demotion is only evaluated on the wrong answer itself, so a rough patch
	# costs one step, not one step per attempt while it sits in the window.
	if not attempt["correct"]:
		var recent_domain := _get_projected_recent_attempts(domain, attempt, DEMOTION_WINDOW)
		var wrong_count := 0
		for entry in recent_domain:
			if not entry["correct"]:
				wrong_count += 1
		var confidence_offset := float(_snapshot["confidenceOffsets"][domain])
		if wrong_count >= DEMOTION_WRONG_THRESHOLD or confidence_offset <= DEMOTION_CONFIDENCE_THRESHOLD:
			progress["currentStep"] = maxi(0, int(progress["currentStep"]) - 1)
			progress["winsAtCurrentStep"] = 0
			_snapshot["confidenceOffsets"][domain] = maxf(
				float(_snapshot["confidenceOffsets"][domain]),
				POST_DEMOTION_CONFIDENCE_FLOOR,
			)
		return

	var promo_window := _get_projected_recent_attempts(domain, attempt, PROMOTION_ACCURACY_WINDOW)
	var accuracy := _compute_first_attempt_accuracy(promo_window)
	if int(progress["winsAtCurrentStep"]) >= PROMOTION_WIN_TARGET and accuracy >= PROMOTION_ACCURACY_TARGET:
		var next_step := _find_next_step_with_content(domain, int(progress["currentStep"]))
		if next_step > int(progress["currentStep"]):
			progress["currentStep"] = next_step
			progress["winsAtCurrentStep"] = 0

## Curriculum step data has authored holes; promotion skips over steps the
## provider says are not practicable, and stays put if nothing above has content.
func _find_next_step_with_content(domain: String, current_step: int) -> int:
	if not _step_content_provider.is_valid():
		return current_step + 1
	for step in range(current_step + 1, current_step + PROMOTION_STEP_SCAN_LIMIT + 1):
		if bool(_step_content_provider.call(domain, step)):
			return step
	return current_step

func _apply_review_update(attempt: Dictionary) -> void:
	var domain := String(attempt["domain"])
	var seen := {}
	for skill in attempt.get("skills", []):
		if seen.has(skill):
			continue
		seen[skill] = true
		var existing: Variant = null
		for item in _snapshot["reviewItems"]:
			if item["domain"] == domain and item["skill"] == skill and item["stage"] != "graduated":
				existing = item
				break

		if not attempt["correct"]:
			if existing != null:
				existing["stage"] = "immediate"
				existing["dueAfterAttempt"] = int(_snapshot["mastery"]["problemsAttempted"]) + _get_review_gap()
				existing["dueAt"] = null
				existing["lastOutcome"] = "wrong"
				existing["updatedAt"] = attempt["answeredAt"]
			else:
				(_snapshot["reviewItems"] as Array).append({
					"id": _generate_id("review"),
					"skill": skill, "domain": domain,
					"sourceProblemId": attempt["problemId"],
					"anchorProblemELO": attempt["problemELO"],
					"stage": "immediate", "dueAt": null,
					"dueAfterAttempt": int(_snapshot["mastery"]["problemsAttempted"]) + _get_review_gap(),
					"successfulReviews": 0, "lastOutcome": "wrong",
					"updatedAt": attempt["answeredAt"],
				})
			continue

		if existing == null:
			continue

		if attempt.get("reviewItemId", null) != null and attempt["reviewItemId"] == existing["id"]:
			existing["lastOutcome"] = "correct"
			existing["updatedAt"] = attempt["answeredAt"]
			var answered := int(attempt["answeredAt"])
			match existing["stage"]:
				"immediate":
					existing["stage"] = "day_1"
					existing["dueAfterAttempt"] = null
					existing["dueAt"] = answered + DAY_MS
				"day_1":
					existing["stage"] = "day_3"
					existing["successfulReviews"] = 1
					existing["dueAt"] = answered + 3 * DAY_MS
				"day_3":
					existing["stage"] = "day_7"
					existing["successfulReviews"] = 2
					existing["dueAt"] = answered + 7 * DAY_MS
				"day_7":
					existing["stage"] = "graduated"
					existing["successfulReviews"] = 3
					existing["dueAt"] = null
					existing["dueAfterAttempt"] = null

	var kept: Array = []
	for item in _snapshot["reviewItems"]:
		if item["stage"] != "graduated":
			kept.append(item)
	_snapshot["reviewItems"] = kept

func _push_backlog_history(domain: String) -> void:
	var history: Dictionary = _snapshot["domainHistory"][domain]
	var active := 0
	for item in _snapshot["reviewItems"]:
		if item["domain"] == domain and item["stage"] != "graduated":
			active += 1
	(history["backlogHistory"] as Array).append(active)
	history["backlogHistory"] = _slice_tail(history["backlogHistory"], MAX_BACKLOG_HISTORY)

func _refresh_derived_state() -> void:
	_snapshot["mastery"] = _elo().get_stats()
	_snapshot["unlockState"] = _compute_unlock_state()
	_snapshot["summary"] = _build_summary()

func _compute_unlock_state() -> Dictionary:
	var next_state := {}
	for domain in ALL_MATH_DOMAINS:
		var prereqs: Array = DOMAIN_PREREQUISITES[domain]
		if prereqs.is_empty():
			next_state[domain] = true
			continue
		var all_ok := true
		for prereq in prereqs:
			var recent := _get_recent_attempts(prereq, 20)
			if recent.size() < 20:
				all_ok = false
				break
			var acc := _compute_first_attempt_accuracy(recent)
			if not (acc >= 0.9 and _get_backlog_trend(prereq) != "growing"):
				all_ok = false
				break
		next_state[domain] = all_ok
	return next_state

func _build_summary() -> Dictionary:
	var domains: Array = []
	for domain in ALL_MATH_DOMAINS:
		var recent := _get_recent_attempts(domain, 20)
		var mastery_elo: float = _elo().get_effective_elo(domain)
		var conf := float(_snapshot["confidenceOffsets"][domain])
		var cp: Dictionary = _snapshot["curriculumProgress"][domain]
		var active_review := 0
		for item in _snapshot["reviewItems"]:
			if item["domain"] == domain and item["stage"] != "graduated":
				active_review += 1
		domains.append({
			"domain": domain, "masteryELO": mastery_elo, "confidenceOffset": conf,
			"effectiveSelectionELO": mastery_elo + conf,
			"currentStep": cp["currentStep"], "winsAtCurrentStep": cp["winsAtCurrentStep"],
			"firstAttemptAccuracy": _compute_first_attempt_accuracy(recent),
			"recentProblemCount": recent.size(), "activeReviewCount": active_review,
			"backlogTrend": _get_backlog_trend(domain),
			"unlocked": bool(_snapshot["unlockState"].get(domain, false)),
		})

	var all_recent: Array = _snapshot["recentAttempts"]
	var last_five := _slice_tail(all_recent, 5)
	var previous_five := _slice_range(all_recent, -10, -5)
	var repeated_hint_count := 0
	for a in last_five:
		if int(a["hintsUsed"]) > 0:
			repeated_hint_count += 1
	var recent_resp := _average_response(last_five)
	var prev_resp := _average_response(previous_five)
	var recent_wrong_skills := {}
	for a in last_five:
		if not a["correct"]:
			for skill in a["skills"]:
				recent_wrong_skills[skill] = int(recent_wrong_skills.get(skill, 0)) + 1

	var mastery_by_domain := {}
	for domain in ALL_MATH_DOMAINS:
		mastery_by_domain[domain] = _elo().get_effective_elo(domain)

	var review_skills := {}
	for item in _snapshot["reviewItems"]:
		if item["stage"] != "graduated":
			review_skills[item["skill"]] = true

	var wrong_in_five := 0
	for a in last_five:
		if not a["correct"]:
			wrong_in_five += 1
	var repeat_misses := wrong_in_five >= 3
	for c in recent_wrong_skills.values():
		if int(c) >= 2:
			repeat_misses = true
	var low_confidence := false
	for d in domains:
		if float(d["confidenceOffset"]) <= -25.0:
			low_confidence = true

	return {
		"firstAttemptAccuracy": _compute_first_attempt_accuracy(_slice_tail(all_recent, 20)),
		"currentMasteryByDomain": mastery_by_domain,
		"activeReviewSkills": review_skills.keys(),
		"frustrationFlags": {
			"repeatMisses": repeat_misses,
			"responseTimeSpike": prev_resp > 0.0 and recent_resp > prev_resp * 1.35 and recent_resp > 4500.0,
			"repeatedHints": repeated_hint_count >= 3,
			"lowConfidence": low_confidence,
		},
		"domains": domains,
	}

func _get_recent_attempts(domain: String, count: int) -> Array:
	var filtered: Array = []
	for a in _snapshot["recentAttempts"]:
		if a["domain"] == domain:
			filtered.append(a)
	return _slice_tail(filtered, count)

func _get_projected_recent_attempts(domain: String, incoming: Dictionary, count: int) -> Array:
	var recent := _get_recent_attempts(domain, count - 1)
	var out := recent.duplicate()
	out.append(_attempt_record(incoming))
	return _slice_tail(out, count)

func _compute_first_attempt_accuracy(attempts: Array) -> float:
	if attempts.is_empty():
		return 0.0
	var wins := 0
	for a in attempts:
		if a["correct"] and a["firstAttempt"]:
			wins += 1
	return float(wins) / attempts.size()

func _get_backlog_trend(domain: String) -> String:
	var history: Array = _snapshot["domainHistory"][domain]["backlogHistory"]
	if history.size() < 2:
		return "stable"
	var previous := history.slice(0, history.size() - 1)
	var sum := 0.0
	for v in previous:
		sum += float(v)
	var prev_avg := sum / previous.size()
	var current := float(history[history.size() - 1])
	if current > prev_avg + 0.5:
		return "growing"
	if current < prev_avg - 0.5:
		return "shrinking"
	return "stable"

func _get_stage_rank(stage: String) -> int:
	match stage:
		"immediate": return 0
		"day_1": return 1
		"day_3": return 2
		"day_7": return 3
		"graduated": return 4
	return 4

func _average_response(attempts: Array) -> float:
	if attempts.is_empty():
		return 0.0
	var sum := 0.0
	for a in attempts:
		sum += float(a["responseMs"])
	return sum / attempts.size()

func _create_default_snapshot(child_id: String, family_id: String, mastery: Dictionary) -> Dictionary:
	return {
		"childId": child_id, "familyId": family_id, "mastery": mastery,
		"confidenceOffsets": _create_number_map(0.0),
		"curriculumProgress": _create_curriculum_progress_map(),
		"reviewItems": [], "recentAttempts": [], "recentProblemIds": [],
		"domainHistory": _create_domain_history_map(),
		"unlockState": {
			"addition": true, "subtraction": false, "multiplication": false, "division": false,
			"counting": true, "comparison": false, "pattern_matching": false, "number_sequence": false,
		},
		"latestSyncCursor": null, "lastSyncedAt": null, "syncStatus": "local-only",
		"summary": _create_default_summary(),
	}

func _create_default_summary() -> Dictionary:
	return {
		"firstAttemptAccuracy": 0.0,
		"currentMasteryByDomain": _create_number_map(0.0),
		"activeReviewSkills": [],
		"frustrationFlags": {"repeatMisses": false, "responseTimeSpike": false, "repeatedHints": false, "lowConfidence": false},
		"domains": [],
	}

func _create_number_map(v: float) -> Dictionary:
	var m := {}
	for d in ALL_MATH_DOMAINS:
		m[d] = v
	return m

func _create_domain_history_map() -> Dictionary:
	var m := {}
	for d in ALL_MATH_DOMAINS:
		m[d] = {"backlogHistory": []}
	return m

func _create_curriculum_progress_map() -> Dictionary:
	return {
		"addition": {"currentStep": 2, "winsAtCurrentStep": 0, "recentStepResults": []},
		"subtraction": {"currentStep": 0, "winsAtCurrentStep": 0, "recentStepResults": []},
		"multiplication": {"currentStep": 0, "winsAtCurrentStep": 0, "recentStepResults": []},
		"division": {"currentStep": 0, "winsAtCurrentStep": 0, "recentStepResults": []},
		"counting": {"currentStep": 2, "winsAtCurrentStep": 0, "recentStepResults": []},
		"comparison": {"currentStep": 0, "winsAtCurrentStep": 0, "recentStepResults": []},
		"pattern_matching": {"currentStep": 0, "winsAtCurrentStep": 0, "recentStepResults": []},
		"number_sequence": {"currentStep": 0, "winsAtCurrentStep": 0, "recentStepResults": []},
	}

func _merge_number_map(base: Dictionary, over: Dictionary) -> Dictionary:
	var out := base.duplicate(true)
	for k in over:
		out[k] = over[k]
	return out

func _merge_unlock(base: Dictionary, over: Dictionary) -> Dictionary:
	return _merge_number_map(base, over)

func _merge_domain_history(history: Variant) -> Dictionary:
	var merged := _create_domain_history_map()
	if not (history is Dictionary):
		return merged
	for domain in ALL_MATH_DOMAINS:
		var src: Array = history.get(domain, {}).get("backlogHistory", []) if history.get(domain, null) is Dictionary else []
		merged[domain]["backlogHistory"] = _slice_tail(src, MAX_BACKLOG_HISTORY)
	return merged

func _merge_curriculum_progress(progress: Variant) -> Dictionary:
	var merged := _create_curriculum_progress_map()
	if not (progress is Dictionary):
		return merged
	for domain in ALL_MATH_DOMAINS:
		var p: Dictionary = progress.get(domain, {}) if progress.get(domain, null) is Dictionary else {}
		merged[domain] = {
			"currentStep": maxi(0, int(p.get("currentStep", 0))),
			"winsAtCurrentStep": maxi(0, int(p.get("winsAtCurrentStep", 0))),
			"recentStepResults": _slice_tail(p.get("recentStepResults", []), MAX_STEP_RESULTS),
		}
	return merged

func _get_review_gap() -> int:
	if not _review_gap_queue.is_empty():
		return int(_review_gap_queue.pop_front())
	return IMMEDIATE_REVIEW_MIN_GAP + (randi() % (IMMEDIATE_REVIEW_MAX_GAP - IMMEDIATE_REVIEW_MIN_GAP + 1))

func _generate_id(prefix: String) -> String:
	_id_counter += 1
	return "%s-%d-%d" % [prefix, _now_ms(), _id_counter]

func _now_ms() -> int:
	return int(Time.get_unix_time_from_system() * 1000.0)

# Array tail/range helpers mirroring JS Array.slice semantics used above.
func _slice_tail(arr: Array, n: int) -> Array:
	if n <= 0 or arr.is_empty():
		return [] if n <= 0 else arr.duplicate()
	if arr.size() <= n:
		return arr.duplicate()
	return arr.slice(arr.size() - n, arr.size())

func _slice_range(arr: Array, start: int, end: int) -> Array:
	# Mirrors arr.slice(start, end) with negative indices.
	var n := arr.size()
	var s := start if start >= 0 else maxi(0, n + start)
	var e := end if end >= 0 else maxi(0, n + end)
	s = clampi(s, 0, n)
	e = clampi(e, 0, n)
	if s >= e:
		return []
	return arr.slice(s, e)
