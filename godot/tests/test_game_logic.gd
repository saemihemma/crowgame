extends TestCase
## Slice 5: Game loop logic — entity spawning from the real level, coin
## collection, lives/hurt/respawn, and death reset (signals + state). Physics
## overlap is covered separately by the coin-pickup integration probe.

const GAME_SCENE := preload("res://scenes/Game.tscn")


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

## Every spawn the level declares becomes a node, by type.
##
## This used to name three magic numbers (20 coins, 6 hazards, 1 door) and it
## broke the moment three of level_01's coins became big coins -- which is the
## right failure for the wrong reason: the test was pinned to today's level
## content rather than to the pipeline. Derived from the level now, which is
## strictly stronger. A spawn silently dropped is what this is for, and a magic
## number could not tell that from an edit to the map.
##
## Not vacuous: the expected counts come from the parsed level and the actual ones
## from the scene tree, so a spawn type with no registry entry (the failure mode
## when a new type is added) reports as a missing node rather than agreeing with
## itself. The registry is walked so the check covers types this test has never
## heard of.
func test_every_declared_spawn_becomes_a_node() -> void:
	var g := _make_game()
	var world: Node = g.get_node("World")
	assert_true(g.get_player() != null, "player spawned")

	var registry: Dictionary = DataManager.get_dict("SPAWN_REGISTRY")
	var expected := {}
	for spawn in g._parsed.get("spawns", []):
		var type := String(spawn.get("type", ""))
		if not registry.has(type):
			continue
		expected[type] = int(expected.get(type, 0)) + 1

	assert_true(expected.size() >= 3,
		"level_01 declares several kinds of spawn (got %s)" % str(expected))
	for type: String in expected:
		var scene_file := String((registry[type] as Dictionary).get("scene", "")).get_file()
		assert_eq(_count_instances(world, scene_file), int(expected[type]),
			"every '%s' in the level is in the world" % type)

	# And the one number worth naming, because it is a design rule rather than a
	# fact about this map: a level has exactly one way out.
	assert_eq(_count_instances(world, "Door.tscn"), 1, "one door")
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
# the input to both the owl ring's flame and the top-centre toast.
#
# The rule these enforce is the doc's, not intuition's: **a wrong answer pauses
# the streak, it never resets it.** The count survives a miss and the flame dims
# to 40% until the next correct answer relights it; only leaving the level clears
# it. The first version of this file asserted the opposite - that a wrong answer
# breaks the streak - on the reasoning that a reward which cannot be lost is not
# a reward. That is right for an adult game and wrong for this one: it puts a
# punishment on the most confidence-sensitive moment a seven-year-old has.

func _answer(correct: bool) -> void:
	EventBus.math_answer_submitted.emit({"problemId": "p", "selectedAnswer": 1, "isCorrect": correct})

func test_correct_answers_extend_the_streak() -> void:
	var g := _make_game()
	var seen: Array = []
	var cb := func(s: int, paused: bool): seen.append([s, paused])
	EventBus.streak_changed.connect(cb)
	_answer(true)
	_answer(true)
	_answer(true)
	assert_eq(g.streak, 3, "three correct answers make a streak of three")
	assert_eq(seen, [[1, false], [2, false], [3, false]], "each step announced once, in order")
	EventBus.streak_changed.disconnect(cb)
	g.free()

## The rule the doc is emphatic about. A child who misses one keeps their run.
func test_a_wrong_answer_pauses_but_does_not_reset() -> void:
	var g := _make_game()
	_answer(true)
	_answer(true)
	_answer(false)
	assert_eq(g.streak, 2, "the count survives a miss")
	assert_true(g.streak_paused, "the flame is dimmed, not out")
	g.free()

## Relighting is the whole point of pausing: the next win picks up where the run
## left off rather than starting again from one.
func test_the_next_correct_answer_relights_and_continues() -> void:
	var g := _make_game()
	_answer(true)
	_answer(true)
	_answer(false)
	_answer(true)
	assert_eq(g.streak, 3, "the run continues from where it paused")
	assert_true(not g.streak_paused, "the flame is lit again")
	g.free()

## Only leaving the level clears it.
func test_loading_a_level_clears_the_streak() -> void:
	var g := _make_game()
	_answer(true)
	_answer(true)
	g._load_level("level_01")
	assert_eq(g.streak, 0, "a fresh level starts a fresh run")
	assert_true(not g.streak_paused, "and an unpaused one")
	g.free()

## A second miss changes nothing that is already true, and re-announcing it would
## re-fire anything listening for the transition.
func test_a_second_miss_announces_nothing_new() -> void:
	var g := _make_game()
	_answer(true)
	_answer(false)
	var count := [0]
	var cb := func(_s: int, _p: bool): count[0] += 1
	EventBus.streak_changed.connect(cb)
	_answer(false)
	_answer(false)
	assert_eq(count[0], 0, "an already-paused streak stays quiet")
	EventBus.streak_changed.disconnect(cb)
	g.free()
