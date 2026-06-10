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
