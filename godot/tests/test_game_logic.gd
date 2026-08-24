extends TestCase
## Slice 5: Game loop logic — entity spawning from the real level, coin
## collection, lives/hurt/respawn, and death reset (signals + state). Physics
## overlap is covered separately by the coin-pickup integration probe.

const GAME_SCENE := preload("res://scenes/Game.tscn")

func _reset() -> void:
	_failures.clear()
	_assertions = 0

func _make_game() -> Node2D:
	var g: Node2D = GAME_SCENE.instantiate()
	g.level_key = "level_01"
	Engine.get_main_loop().root.add_child(g)
	return g

func _count_instances(parent: Node, scene_file: String) -> int:
	var n := 0
	for c in parent.get_children():
		if c.scene_file_path.get_file() == scene_file:
			n += 1
	return n

func test_spawns_from_level() -> void:
	var g := _make_game()
	var world: Node = g.get_node("World")
	assert_true(g.get_player() != null, "player spawned")
	assert_eq(_count_instances(world, "Coin.tscn"), 20, "20 coins spawned")
	assert_eq(_count_instances(world, "Hazard.tscn"), 6, "6 hazards spawned")
	assert_eq(_count_instances(world, "Door.tscn"), 1, "1 door spawned")
	g.free()

func test_collect_coin_increments_and_emits() -> void:
	var g := _make_game()
	var got := [0]
	var cb := func(c): got[0] = c
	EventBus.coins_changed.connect(cb)
	var before: int = g.coin_count
	var dummy := Node2D.new()
	g.add_child(dummy)
	g.collect_coin(dummy)
	assert_eq(g.coin_count, before + 1, "coin_count incremented")
	assert_eq(got[0], before + 1, "coins_changed emitted with new count")
	EventBus.coins_changed.disconnect(cb)
	g.free()

func test_hurt_decrements_and_respawns() -> void:
	var g := _make_game()
	assert_eq(g.lives, 3, "starts with 3 lives")
	g.hurt_player()
	assert_eq(g.lives, 2, "lives decremented")
	assert_true(g.respawning, "respawning after hurt")
	# Player returned to spawn.
	assert_true(g.get_player().global_position.distance_to(g.spawn_point) < 1.0, "player at spawn after hurt")
	g.free()

func test_death_resets_run() -> void:
	# Death now schedules a FULL level reload (Phaser scene.restart parity);
	# the respawn-of-entities half is covered by the DeathProbe integration test.
	var g := _make_game()
	var died := [false]
	var dcb := func(): died[0] = true
	EventBus.player_died.connect(dcb)
	g.coin_count = g.coins_at_level_start + 5
	g.lives = 1
	g.respawning = false
	g.hurt_player()  # -> lives 0 -> player_die()
	assert_true(died[0], "player_died emitted")
	assert_eq(g.coin_count, g.coins_at_level_start, "coins reset to level start on death")
	assert_true(g.transitioning, "level reload pending after death")
	EventBus.player_died.disconnect(dcb)
	g.free()

func test_level_start_persists_current_level() -> void:
	var g := _make_game()
	assert_eq(String(SaveManager.get_data().get("currentLevel", "")), "level_01", "save.currentLevel written on level start")
	g.free()

func test_continue_resolves_saved_level() -> void:
	var mm = load("res://scripts/scenes/main_menu.gd").new()
	assert_eq(mm.resolve_continue_key({"currentLevel": "level_03"}), "level_03", "continue uses saved level")
	assert_eq(mm.resolve_continue_key({"currentLevel": "level_404"}), "level_01", "unknown level falls back")
	assert_eq(mm.resolve_continue_key({}), "level_01", "missing key falls back")
	mm.free()

func test_transition_sets_flag() -> void:
	var g := _make_game()
	var completed := [""]
	var lcb := func(p): completed[0] = String(p.get("completedLevel", ""))
	EventBus.level_complete.connect(lcb)
	g.transition_to_level("__complete__")
	assert_true(g.transitioning, "transitioning flag set")
	assert_eq(completed[0], "level_01", "level_complete emitted for current level")
	EventBus.level_complete.disconnect(lcb)
	g.free()

# ─── Streak (§10.2) ────────────────────────────────────────
# The streak is what makes a run of clean answers feel like something, and it is
# the input to both the owl ring's flame and the top-centre toast. Its whole
# value comes from being losable, so the reset paths matter as much as the
# increment.

func _complete(g: Node2D, correct: bool, first_attempt: bool) -> void:
	EventBus.math_challenge_complete.emit({"correct": correct, "firstAttempt": first_attempt})

func test_clean_answers_extend_the_streak() -> void:
	var g := _make_game()
	var seen: Array[int] = []
	var cb := func(s: int): seen.append(s)
	EventBus.streak_changed.connect(cb)
	_complete(g, true, true)
	_complete(g, true, true)
	_complete(g, true, true)
	assert_eq(g.streak, 3, "three clean answers make a streak of three")
	assert_eq(seen, [1, 2, 3] as Array[int], "each step is announced once, in order")
	EventBus.streak_changed.disconnect(cb)
	g.free()

func test_a_wrong_answer_breaks_the_streak() -> void:
	var g := _make_game()
	_complete(g, true, true)
	_complete(g, true, true)
	_complete(g, false, false)
	assert_eq(g.streak, 0, "a failed challenge resets the streak")
	g.free()

## A retry is a fine way to learn and a bad way to keep a streak. If second-try
## answers counted, the flame would never go out and would stop meaning anything.
func test_a_retry_does_not_extend_the_streak() -> void:
	var g := _make_game()
	_complete(g, true, true)
	_complete(g, true, false)
	assert_eq(g.streak, 0, "correct on the second attempt resets rather than extends")
	g.free()

## Nothing changed, so nothing should be announced — otherwise the toast fires
## again on every failed challenge after the first.
func test_no_signal_when_the_streak_is_already_zero() -> void:
	var g := _make_game()
	var count := [0]
	var cb := func(_s: int): count[0] += 1
	_complete(g, false, false)
	EventBus.streak_changed.connect(cb)
	_complete(g, false, false)
	_complete(g, false, false)
	assert_eq(count[0], 0, "a streak that stays at zero emits nothing")
	EventBus.streak_changed.disconnect(cb)
	g.free()
