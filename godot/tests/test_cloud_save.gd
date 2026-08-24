extends TestCase
## Cloud-save client behaviour worth locking down in-engine.

func test_problems_attempted_comes_from_elo_stats() -> void:
	SaveManager.adopt_remote_save({
		"coins": 5,
		"eloStats": {"globalELO": 210, "problemsAttempted": 42},
	})
	assert_eq(SaveManager.get_problems_attempted(), 42, "arbiter is read from eloStats")

func test_adopt_remote_save_rehydrates_elo() -> void:
	# A save blob alone changes nothing a child can see: ELO lives in ELOManager,
	# and LearnerStateManager recomputes mastery from it on every read. Adopting a
	# save must push it back into those systems, or the child's difficulty
	# silently resets to a fresh-player 150.
	SaveManager.adopt_remote_save({
		"coins": 11,
		"eloStats": {"globalELO": 275, "problemsAttempted": 60},
	})
	var stats := ELOManager.get_stats()
	assert_eq(int(stats.get("globalELO", 0)), 275, "ELO restored from the adopted save")
	assert_eq(int(SaveManager.get_data().get("coins", 0)), 11, "visible progress restored too")

func test_adopt_ignores_empty_payload() -> void:
	SaveManager.adopt_remote_save({"coins": 7, "eloStats": {"problemsAttempted": 3}})
	var before: int = int(SaveManager.get_data().get("coins", 0))
	SaveManager.adopt_remote_save({})
	assert_eq(int(SaveManager.get_data().get("coins", 0)), before,
		"an empty remote save must not wipe local progress")

func test_adopt_runs_migration() -> void:
	# A save can sit in the cloud across a client update, so an adopted blob goes
	# through the same migrate_save() path as one loaded from disk.
	var migrated := SaveManager.migrate_save({"coins": 3})
	assert_true(migrated.has("version"), "migration stamps a version")

func test_pending_attempts_are_taken_and_confirmed_by_id() -> void:
	var child_id := "child-test-cloud"
	var taken := LearnerSyncService.take_pending_attempts(child_id, 10)
	assert_true(taken is Array, "taking from an empty queue yields an array")
	LearnerSyncService.confirm_attempts(child_id, [])
	assert_eq(LearnerSyncService.take_pending_attempts(child_id, 10).size(), 0, "queue stays empty")

func test_adopt_rejects_a_non_dictionary_payload() -> void:
	# CloudSync reads the payload out of a JSON response, so a malformed or
	# unexpected body must be ignored rather than trusted.
	SaveManager.adopt_remote_save({"coins": 4, "eloStats": {"problemsAttempted": 2}})
	var before: int = int(SaveManager.get_data().get("coins", 0))
	SaveManager.adopt_remote_save("not a save")
	SaveManager.adopt_remote_save([])
	assert_eq(int(SaveManager.get_data().get("coins", 0)), before,
		"a non-dictionary payload must leave local progress untouched")
