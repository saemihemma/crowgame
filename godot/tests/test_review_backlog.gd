extends TestCase
## What the review queue does to a child who stopped playing for a week.
##
## The SRS schedules at day_1 / day_3 / day_7, which assumes a child who plays
## most days. One who skips a week comes back with everything due at once, and
## the review lane is 20% of what the owl asks -- so an uncapped due list means
## the lane samples uniformly out of a pile, and the skill they missed first can
## go unasked for a long stretch while fresher items keep surfacing.
##
## Both rules here are READ-TIME. Neither edits a review item, which is what
## keeps the golden parity fixtures -- which assert on the snapshot -- untouched.

const DAY_MS := 86400000

func _reset() -> void:
	_failures.clear()
	_assertions = 0


func _tuning() -> Dictionary:
	return DataManager.get_dict("MATH_TUNING").get("reviewBacklog", {})


## Build a snapshot with `count` due items in one domain, all at `stage`.
func _snapshot_with(items: Array) -> Dictionary:
	var snap := LearnerStateManager.get_snapshot().duplicate(true)
	snap["reviewItems"] = items
	snap["mastery"]["problemsAttempted"] = 9999
	return snap


func _item(id: String, domain: String, skill: String, stage: String, due_days_ago: float) -> Dictionary:
	return {
		"id": id, "skill": skill, "domain": domain,
		"sourceProblemId": "p", "anchorProblemELO": 200,
		"stage": stage, "dueAt": int(Time.get_unix_time_from_system() * 1000.0) - int(due_days_ago * DAY_MS),
		"dueAfterAttempt": null, "successfulReviews": 0,
		"lastOutcome": "wrong", "updatedAt": 0,
	}


func test_the_backlog_block_is_tuned_not_hardcoded() -> void:
	var t := _tuning()
	assert_true(t.has("maxDuePerDomain"), "maxDuePerDomain is tuned")
	assert_true(t.has("staleAfterDays"), "staleAfterDays is tuned")
	assert_true(int(t.get("maxDuePerDomain", 0)) > 0, "the cap is a positive count")


## The whole point: the lane sees a queue, not a pile.
func test_only_the_most_urgent_few_per_domain_are_offered() -> void:
	var before := LearnerStateManager.get_snapshot().duplicate(true)
	var cap := int(_tuning().get("maxDuePerDomain", 3))
	var items: Array = []
	for i in cap + 4:
		items.append(_item("r%d" % i, "addition", "skill_%d" % i, "day_1", 1.0 + i))
	LearnerStateManager.replace_snapshot(_snapshot_with(items))

	var due := LearnerStateManager.get_due_review_items("addition")
	assert_eq(due.size(), cap, "at most %d addition reviews are offered at once" % cap)
	# Oldest-due first inside a stage, so the child works the backlog down rather
	# than round it.
	assert_eq(String((due[0] as Dictionary)["id"]), "r%d" % (cap + 3),
		"the longest-overdue item is offered first")
	LearnerStateManager.replace_snapshot(before)


## Capping the whole list rather than per domain would let one loud subject
## starve every other subject's reviews.
func test_the_cap_is_per_domain_so_one_domain_cannot_starve_another() -> void:
	var before := LearnerStateManager.get_snapshot().duplicate(true)
	var cap := int(_tuning().get("maxDuePerDomain", 3))
	var items: Array = []
	for i in cap + 3:
		items.append(_item("a%d" % i, "addition", "askill_%d" % i, "day_1", 5.0))
	items.append(_item("s1", "subtraction", "sskill", "day_1", 1.0))
	LearnerStateManager.replace_snapshot(_snapshot_with(items))

	var all := LearnerStateManager.get_due_review_items()
	var domains := {}
	for item in all:
		var d := String((item as Dictionary)["domain"])
		domains[d] = int(domains.get(d, 0)) + 1
	assert_eq(int(domains.get("addition", 0)), cap, "addition is capped")
	assert_eq(int(domains.get("subtraction", 0)), 1, "subtraction still gets its review")
	LearnerStateManager.replace_snapshot(before)


## Sorting by stage alone put a badly overdue day_7 behind every fresh day_1,
## which is backwards: the longer it has been, the less its schedule means.
func test_a_badly_overdue_item_comes_back_first() -> void:
	var before := LearnerStateManager.get_snapshot().duplicate(true)
	var stale_after := float(_tuning().get("staleAfterDays", 9))
	LearnerStateManager.replace_snapshot(_snapshot_with([
		_item("fresh", "addition", "fresh_skill", "day_1", 0.5),
		_item("stale", "addition", "stale_skill", "day_7", stale_after + 3.0),
	]))
	var due := LearnerStateManager.get_due_review_items("addition")
	assert_eq(due.size(), 2, "both are due")
	assert_eq(String((due[0] as Dictionary)["id"]), "stale",
		"a day_7 item %d days overdue outranks a fresh day_1" % int(stale_after + 3.0))
	LearnerStateManager.replace_snapshot(before)


## And an item that is merely due keeps its ordinary place, or "stale" would be
## a synonym for "due" and the rule would say nothing.
func test_an_ordinarily_due_item_keeps_its_stage_order() -> void:
	var before := LearnerStateManager.get_snapshot().duplicate(true)
	LearnerStateManager.replace_snapshot(_snapshot_with([
		_item("later", "addition", "later_skill", "day_7", 1.0),
		_item("sooner", "addition", "sooner_skill", "day_1", 0.5),
	]))
	var due := LearnerStateManager.get_due_review_items("addition")
	assert_eq(String((due[0] as Dictionary)["id"]), "sooner",
		"day_1 still comes before day_7 when neither is stale")
	LearnerStateManager.replace_snapshot(before)
