extends TestCase
## P3: LearnerSyncService local-only behavior (no network) — identical storage
## key contract and queue/cache semantics to LearnerSyncService.ts.

const CHILD := "test-child-sync"

func _reset() -> void:
	_failures.clear()
	_assertions = 0
	Persistence.remove_item("crow_learner_api_base")
	Persistence.remove_item("crow_learner_snapshot_%s" % CHILD)
	Persistence.remove_item("crow_learner_pending_attempts_%s" % CHILD)
	ELOManager.initialize(null)
	LearnerStateManager.initialize({"childId": CHILD, "familyId": "fam"}, null, ELOManager.get_stats())

func _svc() -> Node:
	return Engine.get_main_loop().root.get_node("LearnerSyncService")

func _attempt(id: String) -> Dictionary:
	return {"attemptId": id, "childId": CHILD, "familyId": "fam", "problemId": "p1",
		"domain": "addition", "skills": ["add"], "correct": true, "firstAttempt": true,
		"hintsUsed": 0, "responseMs": 900, "answeredAt": 1000, "problemELO": 150,
		"curriculumStep": 2, "selectionLane": "comfort", "reviewItemId": null}

func test_api_base_parsing() -> void:
	var svc := _svc()
	assert_true(svc.get_api_base() == null, "no base -> null")
	Persistence.set_item("crow_learner_api_base", "  ")
	assert_true(svc.get_api_base() == null, "blank base -> null")
	Persistence.set_item("crow_learner_api_base", "https://api.example.com/")
	assert_eq(svc.get_api_base(), "https://api.example.com", "trailing slash stripped")
	Persistence.remove_item("crow_learner_api_base")

func test_local_only_submit_enqueues_and_caches() -> void:
	var svc := _svc()
	var result: Dictionary = svc.submit_attempt(_attempt("att-1"))
	assert_eq(String(result["snapshot"]["syncStatus"]), "local-only", "status local-only without backend")
	assert_eq((result["appliedAttemptIds"] as Array).size(), 0, "nothing applied locally")
	# Queue persisted under the exact TS key, attempt kept for a future backend.
	var queued: Array = svc.get_queued_attempts(CHILD)
	assert_eq(queued.size(), 1, "attempt queued")
	assert_eq(String(queued[0]["attemptId"]), "att-1", "queued id matches")
	assert_true(Persistence.has_item("crow_learner_pending_attempts_%s" % CHILD), "pending key written")
	assert_true(Persistence.has_item("crow_learner_snapshot_%s" % CHILD), "snapshot cached")

func test_enqueue_dedupes_by_attempt_id() -> void:
	var svc := _svc()
	svc.submit_attempt(_attempt("att-dup"))
	svc.submit_attempt(_attempt("att-dup"))
	assert_eq(svc.get_queued_attempts(CHILD).size(), 1, "duplicate attemptId not re-queued")

func test_snapshot_fallback_without_backend() -> void:
	var svc := _svc()
	var snap: Dictionary = svc.get_learner_snapshot(CHILD)
	assert_eq(String(snap.get("childId", "")), CHILD, "falls back to live learner snapshot")
	# After caching, the cached copy is served.
	svc.cache_snapshot(LearnerStateManager.get_snapshot())
	var cached: Variant = svc.get_cached_snapshot(CHILD)
	assert_true(cached is Dictionary, "cached snapshot readable")

func test_sync_pending_noop_without_backend() -> void:
	var svc := _svc()
	svc.submit_attempt(_attempt("att-2"))
	var result: Dictionary = svc.sync_pending_attempts(CHILD)
	assert_eq((result["appliedAttemptIds"] as Array).size(), 0, "no-op sync applies nothing")
	assert_eq(svc.get_queued_attempts(CHILD).size(), 1, "queue intact without backend")
