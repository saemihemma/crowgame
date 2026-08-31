extends TestCase
## What "% completed" means, and what a finished run is allowed to change.
##
## The arithmetic is tested apart from the save, at values the shipped game does
## not contain, because a percentage that only works on today's registry is a
## coincidence rather than a rule.
##
## The three that matter:
##
## 1. A worse run must take nothing away. This is the promise made to a child who
##    replays a level, and it is silent when broken -- they simply find their
##    record smaller and have no idea why.
## 2. A component a level does not have must not count against it. A level with no
##    big coins would otherwise be permanently capped at two thirds for something
##    it never had.
## 3. Each level is worth the same. A global "all owls over all owls" would make
##    the twenty-owl practice arena worth ten story levels.


func _root() -> Node:
	return Engine.get_main_loop().root

func _save() -> Node:
	return _root().get_node("SaveManager")


# --- 1. the arithmetic ------------------------------------------------------

func test_a_level_scores_its_three_parts_equally() -> void:
	assert_almost_eq(Progress.level_fraction(false, 0, 3, 0, 2), 0.0, 0.001,
		"an untouched level is worth nothing")
	assert_almost_eq(Progress.level_fraction(true, 3, 3, 2, 2), 1.0, 0.001,
		"cleared, every coin, every owl is the whole level")
	assert_almost_eq(Progress.level_fraction(true, 0, 3, 0, 2), 1.0 / 3.0, 0.001,
		"clearing it is worth a third on its own")
	assert_almost_eq(Progress.level_fraction(true, 3, 3, 0, 2), 2.0 / 3.0, 0.001,
		"and the coins another third")

## A level with no big coins is scored out of what it has.
func test_a_missing_component_is_not_counted_against_the_level() -> void:
	assert_almost_eq(Progress.level_fraction(true, 0, 0, 2, 2), 1.0, 0.001,
		"a level with no big coins is finished when it is cleared and its owls are free")
	assert_almost_eq(Progress.level_fraction(true, 0, 0, 0, 0), 1.0, 0.001,
		"a level with neither is finished by being cleared")
	assert_almost_eq(Progress.level_fraction(false, 0, 0, 0, 0), 0.0, 0.001,
		"but not before that")

## A record that outran its denominator reads as finished, not as more than
## finished -- which is what a level edited to hold fewer coins would produce for
## a child who had already found the old ones.
func test_more_than_all_of_it_is_still_all_of_it() -> void:
	assert_almost_eq(Progress.level_fraction(true, 9, 3, 9, 2), 1.0, 0.001,
		"clamped at the top")

func test_the_game_is_the_mean_of_its_levels_not_of_its_owls() -> void:
	assert_almost_eq(Progress.overall_fraction([1.0, 0.0]), 0.5, 0.001,
		"one of two levels finished is half the game")
	assert_almost_eq(Progress.overall_fraction([1.0, 1.0, 0.25]), 0.75, 0.001,
		"every level weighs the same regardless of how much is in it")
	assert_almost_eq(Progress.overall_fraction([]), 0.0, 0.001,
		"nothing to average does not divide by zero")

## The displayed number never rounds a child up into a lie.
func test_the_shown_number_never_says_finished_early() -> void:
	assert_eq(Progress.percent(1.0), 100, "actually finished reads 100")
	assert_eq(Progress.percent(0.999), 99, "one owl short reads 99, never 100")
	assert_eq(Progress.percent(0.0), 0, "nothing reads 0")
	assert_eq(Progress.percent(0.5), 50, "half reads 50")
	assert_eq(Progress.percent(1.5), 100, "past the end is still 100")


# --- 2. the practice arena --------------------------------------------------

func test_the_practice_arena_is_outside_the_percentage() -> void:
	var levels: Node = _root().get_node("LevelManager")
	assert_true(not levels.counts_toward_completion("level_99"),
		"the drill room is not part of finishing the game")
	var story := 0
	for entry in levels.get_levels():
		if levels.counts_toward_completion(String(entry.get("key", ""))):
			story += 1
	assert_true(story >= 8, "the eight story levels are (%d counted)" % story)

	var rows: Array = Progress.of_save(_save().get_data()).get("levels", [])
	for row in rows:
		assert_true(String(row.get("key", "")) != "level_99",
			"and it never appears as a row on the completion screen")
	assert_eq(rows.size(), story, "one row per counted level")


# --- 3. banking -------------------------------------------------------------

func _reset_records() -> void:
	var data: Dictionary = _save().get_data()
	data["levelRecords"] = {}

func test_a_finished_run_becomes_a_record() -> void:
	_reset_records()
	var save := _save()
	save.bank_run("level_01", ["c1", "c3"], 2)
	var record: Dictionary = save.get_level_record("level_01")
	assert_eq((record.get("bigCoins", []) as Array).size(), 2, "both coins banked")
	assert_eq(int(record.get("owls", 0)), 2, "and the owls")
	assert_true(save.has_big_coin("level_01", "c1"), "by id")
	_reset_records()

## The promise. A child who replays a level and does worse keeps what they had.
func test_a_worse_run_takes_nothing_away() -> void:
	_reset_records()
	var save := _save()
	save.bank_run("level_01", ["c1", "c2", "c3"], 2)
	save.bank_run("level_01", ["c1"], 0)
	var record: Dictionary = save.get_level_record("level_01")
	assert_eq((record.get("bigCoins", []) as Array).size(), 3,
		"the three coins survive a run that found one")
	assert_eq(int(record.get("owls", 0)), 2,
		"and the owl count survives a run that freed none")
	_reset_records()

func test_a_better_run_adds_to_it() -> void:
	_reset_records()
	var save := _save()
	save.bank_run("level_01", ["c1"], 1)
	save.bank_run("level_01", ["c2"], 2)
	var record: Dictionary = save.get_level_record("level_01")
	assert_eq((record.get("bigCoins", []) as Array).size(), 2, "the two runs union")
	assert_eq(int(record.get("owls", 0)), 2, "and the better owl count wins")
	_reset_records()

func test_banking_nothing_named_is_ignored() -> void:
	_reset_records()
	var save := _save()
	save.bank_run("", ["c1"], 1)
	assert_true(save.get_level_record("").is_empty(), "a run with no level is not a record")
	save.bank_run("level_01", ["", ""], 0)
	assert_eq((save.get_level_record("level_01").get("bigCoins", []) as Array).size(), 0,
		"a coin with no id is not banked as an empty string")
	_reset_records()


# --- 4. the sync ------------------------------------------------------------

## Records merge on a cloud adopt instead of being replaced.
##
## The sync arbitrates whole saves by problems_attempted, so the blob with more
## maths wins outright. A best run is the one thing in the save that is monotone,
## and without this a hard coin found on the iPad is thrown away by a phone that
## happened to answer more questions -- and the child is told they never found it.
func test_a_remote_save_cannot_delete_a_record_this_device_has() -> void:
	_reset_records()
	var save := _save()
	save.bank_run("level_01", ["c3"], 2)
	var remote: Dictionary = save.get_data().duplicate(true)
	remote["levelRecords"] = {"level_01": {"bigCoins": ["c1"], "owls": 0}}
	save.adopt_remote_save(remote)
	var record: Dictionary = save.get_level_record("level_01")
	var found: Array = record.get("bigCoins", [])
	assert_true(found.has("c3"), "the coin only this device had survives the sync")
	assert_true(found.has("c1"), "and the remote's coin arrives")
	assert_eq(int(record.get("owls", 0)), 2, "the higher owl count wins")
	_reset_records()


## And the record is written by walking through the DOOR, not by some other path.
##
## The two halves are tested apart -- bank_run above, the arithmetic above that --
## so this is the wire between them: if the call at the door were dropped, every
## test above would still pass and no child would ever record anything.
func test_reaching_the_door_is_what_writes_the_record() -> void:
	_reset_records()
	var save := _save()
	var g: Node2D = load("res://scenes/Game.tscn").instantiate()
	g.level_key = "level_01"
	_root().add_child(g)

	# Stand in for a run that found two coins and freed both owls.
	g._big_coins_found = ["c1", "c2"] as Array[String]
	g._owls_freed = 2
	assert_true(save.get_level_record("level_01").is_empty(),
		"nothing is banked while the run is still going")

	g.transition_to_level("level_02")
	var record: Dictionary = save.get_level_record("level_01")
	assert_eq((record.get("bigCoins", []) as Array).size(), 2,
		"stepping through the door banks what the run found")
	assert_eq(int(record.get("owls", 0)), 2, "and the owls it freed")

	g.free()
	_reset_records()


# --- what a death costs, and what it never touches -------------------------
#
# Death used to cost the current run and no more, which read as free: bank_run
# only ever writes at the door, so a run ending in death banked nothing -- but
# everything earlier runs had banked survived, the level reloaded, every coin
# respawned, and a child could lose all three hearts and be exactly where they
# started. The owner's decision (2026-08) is that the LEVEL goes back to nothing
# while the world stays unlocked and the maths is never taken away.

func _with_clean_save(body: Callable) -> void:
	var before := SaveManager.get_data().duplicate(true)
	body.call()
	SaveManager._data = before

func test_running_out_of_hearts_empties_this_levels_record() -> void:
	_with_clean_save(func() -> void:
		SaveManager.bank_run("level_01", ["c1", "c2", "c3"], 4, true)
		SaveManager.bank_run("level_02", ["c1"], 1, false)
		assert_eq(int(SaveManager.get_level_record("level_01").get("owls", 0)), 4,
			"level 1 has a record to lose")

		SaveManager.forget_level_run("level_01")

		assert_true(SaveManager.get_level_record("level_01").is_empty(),
			"the level a child died in is back to nothing")
		assert_true(not SaveManager.has_big_coin("level_01", "c1"),
			"and its big coins have to be found again")
		assert_eq(int(SaveManager.get_level_record("level_02").get("owls", 0)), 1,
			"but no other world is touched")
	)

## The two things death must never take. A world is never re-locked, and what a
## child KNOWS is not a possession the game may confiscate -- PRODUCT.md.
func test_death_never_relocks_a_world_or_touches_the_maths() -> void:
	_with_clean_save(func() -> void:
		SaveManager.complete_level("level_01")
		SaveManager.bank_run("level_01", ["c1"], 2, false)
		var elo_before := SaveManager.get_problems_attempted()

		SaveManager.forget_level_run("level_01")

		var cleared: Array = SaveManager.get_data().get("completedLevels", [])
		assert_true(cleared.has("level_01"), "the world stays unlocked")
		assert_eq(SaveManager.get_problems_attempted(), elo_before,
			"and the maths is untouched")
	)

## Forgetting a level nobody has played is a no-op, not a crash. player_die()
## calls this on every death, including the first one in a brand-new level.
func test_forgetting_an_unplayed_level_does_nothing() -> void:
	_with_clean_save(func() -> void:
		SaveManager.forget_level_run("level_07")
		SaveManager.forget_level_run("")
		assert_true(SaveManager.get_level_record("level_07").is_empty(), "still nothing, still fine")
	)


# --- every coin, in one go -------------------------------------------------

## The tick cannot be derived from the pips, and this is why: three filled pips
## also describes a child who found one coin on each of three separate runs.
func test_a_coin_per_run_is_not_a_perfect_run() -> void:
	_with_clean_save(func() -> void:
		SaveManager.bank_run("level_03", ["c1"], 1, false)
		SaveManager.bank_run("level_03", ["c2"], 1, false)
		SaveManager.bank_run("level_03", ["c3"], 1, false)
		var record := SaveManager.get_level_record("level_03")
		assert_eq((record.get("bigCoins", []) as Array).size(), 3,
			"the child owns all three coins, and the HUD should say so")
		assert_true(not bool(record.get("perfect", false)),
			"but they have never cleared the level in one visit, so there is no tick")
	)

func test_all_the_coins_in_one_visit_earns_the_tick() -> void:
	_with_clean_save(func() -> void:
		SaveManager.bank_run("level_04", ["c1", "c2", "c3"], 3, true)
		assert_true(bool(SaveManager.get_level_record("level_04").get("perfect", false)),
			"all three in one go is the tick")
	)

## Latched, like every other fact in this record. A tick that a later, lazier
## visit could take away would mean "how I did last time", which is not a thing
## worth going back for.
func test_a_later_worse_run_never_takes_the_tick_away() -> void:
	_with_clean_save(func() -> void:
		SaveManager.bank_run("level_05", ["c1", "c2", "c3"], 3, true)
		SaveManager.bank_run("level_05", ["c1"], 1, false)
		assert_true(bool(SaveManager.get_level_record("level_05").get("perfect", false)),
			"earned once, kept")
	)

## And the row the journey screen draws carries it, so the screen never has to
## re-derive the thing the save deliberately records separately.
func test_the_progress_row_reports_the_perfect_run() -> void:
	_with_clean_save(func() -> void:
		var key := String(LevelManager.get_levels()[0].get("key", ""))
		SaveManager.bank_run(key, ["c1", "c2", "c3"], 9, true)
		var rows: Array = Progress.of_save(SaveManager.get_data()).get("levels", [])
		var found := false
		for row: Dictionary in rows:
			if String(row.get("key", "")) != key:
				continue
			found = true
			assert_true(bool(row.get("perfect", false)), "the row carries the tick")
		assert_true(found, "the level is in the report")
	)
