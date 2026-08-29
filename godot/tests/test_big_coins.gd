extends TestCase
## The three big coins hidden in every level.
##
## They exist because ordinary coins are a bad unit of progress: they drop into a
## lifetime purse that only rises, and "412 of 530" tells a six-year-old nothing
## and barely moves. Three per level is countable on one hand.
##
## Four things have to hold, and every one of them fails silently:
##
## 1. A big coin is its own spawn type with its own scene. If the compiler emits
##    it as an ordinary collectible it becomes a coin worth one coin, and nothing
##    errors -- a child just never finds any.
## 2. Identity is the spec's `id`, never a spawn index. An index means moving a
##    coin wipes the record of everyone who already had it.
## 3. One already banked comes back as a ghost you walk through. An Area2D still
##    monitoring is one bug away from awarding a coin twice.
## 4. Both sounds are registered against real files, because AudioManager returns
##    silently on an unknown key.


func _root() -> Node:
	return Engine.get_main_loop().root

func _levels() -> Node:
	return _root().get_node("LevelManager")

func _save() -> Node:
	return _root().get_node("SaveManager")


# --- 1. the spawn pipeline ---------------------------------------------------

## The compiled maps carry big coins as their OWN object type, and every one of
## them names an id. Read off the shipped levels, so a spec authored without an
## id fails here rather than in a child's hands.
func test_every_big_coin_in_every_level_has_an_id() -> void:
	var checked := 0
	var levels_with_coins := 0
	for entry in _levels().get_levels():
		var key := String(entry.get("key", ""))
		var path := "res://%s" % String(entry.get("mapFile", ""))
		if not FileAccess.file_exists(path):
			continue
		var f := FileAccess.open(path, FileAccess.READ)
		var level: Variant = JSON.parse_string(f.get_as_text())
		f.close()
		if not (level is Dictionary):
			continue
		var ids := {}
		for layer in (level as Dictionary).get("layers", []):
			if String(layer.get("type", "")) != "objectgroup":
				continue
			for obj in layer.get("objects", []):
				if String(obj.get("type", "")) != "big_coin":
					continue
				var id := ""
				for prop in obj.get("properties", []):
					if String(prop.get("name", "")) == "coin_id":
						id = String(prop.get("value", ""))
				assert_true(id != "",
					"%s: a big coin with no coin_id could never be banked" % key)
				assert_true(not ids.has(id),
					"%s: two big coins share the id '%s', so collecting one would mark both" % [key, id])
				ids[id] = true
				checked += 1
		if ids.size() > 0:
			levels_with_coins += 1
	assert_true(checked > 0,
		"the compiled levels contain big coins at all -- if this fails the compiler stopped emitting the type")
	assert_true(levels_with_coins > 0, "at least one level holds them")

## The spawn registry knows the type, and it points at a scene that can be told
## where to stand. game.gd spawns purely by this lookup, so a missing entry is a
## coin that silently never appears.
func test_the_spawn_type_resolves_to_a_scene() -> void:
	var registry: Dictionary = DataManager.get_dict("SPAWN_REGISTRY")
	assert_true(registry.has("big_coin"),
		"spawn_registry.json maps big_coin to a scene; without it the spawn is skipped in silence")
	var path := String((registry.get("big_coin", {}) as Dictionary).get("scene", ""))
	assert_true(ResourceLoader.exists(path), "big_coin's scene exists: %s" % path)
	var node = (load(path) as PackedScene).instantiate()
	assert_true(node.has_method("setup_from_spawn"), "the scene self-configures from its spawn")
	node.queue_free()

## Its art is registered as its own class at its own size. A big coin that reuses
## `pickup` would be drawn at 32px and be indistinguishable from a coin, which is
## the one thing it must never be.
func test_the_art_is_registered_as_its_own_size() -> void:
	assert_true(SpriteSheet.has_art("big_coin"), "big_coin names art that exists")
	var frame := SpriteSheet.frame_size("big_coin")
	var coin := SpriteSheet.frame_size("coin")
	assert_true(frame.x > coin.x and frame.y > coin.y,
		"a big coin is drawn bigger than a coin (%s vs %s); a child has to tell them apart across a screen"
			% [str(frame), str(coin)])


# --- 2 and 3. identity, and the ghost ---------------------------------------

func test_a_banked_coin_is_matched_by_id_not_by_position() -> void:
	var save := _save()
	var data: Dictionary = save.get_data()
	var before: Variant = data.get("levelRecords", {})
	data["levelRecords"] = {"level_01": {"bigCoins": ["c2"]}}
	assert_true(save.has_big_coin("level_01", "c2"), "a banked id reads back")
	assert_true(not save.has_big_coin("level_01", "c1"), "an unbanked id in the same level does not")
	assert_true(not save.has_big_coin("level_02", "c2"), "the same id in another level is a different coin")
	assert_true(not save.has_big_coin("level_01", ""), "a coin with no id is never banked, rather than matching everything")
	data["levelRecords"] = before

## A coin the child already has comes back as scenery. `monitoring` is the
## assertion that matters: an unconnected signal on a live Area2D is one edit
## away from awarding it a second time.
func test_a_banked_coin_comes_back_as_a_ghost() -> void:
	var save := _save()
	var data: Dictionary = save.get_data()
	var before: Variant = data.get("levelRecords", {})
	var was_level: String = _levels().get_current_level_key()
	_levels().set_current_level("level_01")
	data["levelRecords"] = {"level_01": {"bigCoins": ["c1"]}}

	var scene := load("res://scenes/BigCoin.tscn") as PackedScene
	var ghost = scene.instantiate()
	ghost.setup_from_spawn({"x": 0, "y": 0, "props": {"coin_id": "c1"}})
	_root().add_child(ghost)
	assert_true(ghost.banked, "c1 is already banked, so it knows it")
	assert_true(not ghost.monitoring, "and it stops detecting the player entirely")

	var live = scene.instantiate()
	live.setup_from_spawn({"x": 0, "y": 0, "props": {"coin_id": "c3"}})
	_root().add_child(live)
	assert_true(not live.banked, "c3 was never banked")
	assert_true(live.monitoring, "so it is still there to be found")

	ghost.queue_free()
	live.queue_free()
	data["levelRecords"] = before
	_levels().set_current_level(was_level)


# --- 4. the sounds -----------------------------------------------------------

## AudioManager.play_event returns silently on an unknown key, so a typo here is
## a moment with no sound and no error. check_hardcoding.py proves every event has
## a caller; this proves each one reaches a file.
func test_both_moments_have_a_sound_that_exists() -> void:
	var events: Dictionary = DataManager.get_dict("SOUND_EVENTS")
	var sfx: Dictionary = DataManager.get_dict("AUDIO_MANIFEST").get("sfx", {})
	for event in ["big_coin", "big_coin_all"]:
		assert_true(events.has(event), "sound_events.json registers '%s'" % event)
		var asset := String(events.get(event, ""))
		assert_true(sfx.has(asset), "'%s' maps to a manifest key (%s)" % [event, asset])
		var file := String((sfx.get(asset, {}) as Dictionary).get("file", ""))
		assert_true(file != "" and FileAccess.file_exists("res://%s" % file),
			"'%s' points at a file that is there: %s" % [event, file])
	assert_true(String(events.get("big_coin", "")) != String(events.get("big_coin_all", "")),
		"finding one and finding all three are different sounds; sharing a file makes 3/3 land as another pickup")


# --- 5. what the row is counting --------------------------------------------

## The HUD row counts what the child HAS in this level, not what this run added.
##
## Seeded empty, a returning child with one banked saw an empty row of three -- and
## the banked one had come back as a ghost they cannot collect, so 3/3 was
## unreachable and the row was promising something the level could not give. Found
## in a screenshot, not by a test, which is why there is now a test.
func test_the_row_counts_what_the_child_has_not_what_this_run_added() -> void:
	var save := _save()
	var data: Dictionary = save.get_data()
	var before: Variant = data.get("levelRecords", {})
	data["levelRecords"] = {"level_01": {"bigCoins": ["c1"]}}

	var seen := [-1, -1]
	var cb := func(found: int, total: int) -> void:
		seen[0] = found
		seen[1] = total
	EventBus.big_coins_changed.connect(cb)

	var g: Node2D = load("res://scenes/Game.tscn").instantiate()
	g.level_key = "level_01"
	_root().add_child(g)

	assert_eq(seen[1], 3, "level_01 holds three big coins")
	assert_eq(seen[0], 1, "the one already banked is already lit; it cannot be collected again")

	EventBus.big_coins_changed.disconnect(cb)
	g.free()
	data["levelRecords"] = before


# --- 5. the report that started this -----------------------------------------

## A NEW CHILD, LEVEL ONE, ALL THREE COINS, THEN LEVEL TWO.
##
## Reported from play: "I created a new char, played first level, collected 3
## gold big coins, then next level they were transparent -- but I was playing it
## for the first time."
##
## That is this bug seen from the sofa. _load_level is reached from _ready and
## from _swap_level, and only the first ever told LevelManager where the player
## was; the coin ids are `c1`/`c2`/`c3` in EVERY level, so level_02's three coins
## asked whether level_01's `c1` was banked, got yes three times, and spawned as
## walk-through ghosts in a level the child had never opened.
##
## The other tests in this file check the pieces -- that an id is matched per
## level, that a banked coin becomes a ghost. Both passed throughout, because
## both are correct. This one walks the route a child walks, which is the only
## way the pieces were ever wrong together.
func test_a_new_level_never_opens_with_ghosts_from_the_level_before() -> void:
	var save := _save()
	var data: Dictionary = save.get_data()
	var before: Variant = data.get("levelRecords", {})
	var was_level: String = _levels().get_current_level_key()

	# Level one, finished, all three found -- exactly what banking at the door
	# leaves behind.
	data["levelRecords"] = {"level_01": {"bigCoins": ["c1", "c2", "c3"], "owls": 2}}

	var game: Node2D = load("res://scenes/Game.tscn").instantiate()
	game.level_key = "level_01"
	_root().add_child(game)
	assert_eq(_levels().get_current_level_key(), "level_01", "the child is in world one")

	# Through the door. This is the step that used to change the map and nothing
	# else.
	await game._swap_level("level_02")

	var ghosts: Array[String] = []
	var found := 0
	for child in game.get_node("World").get_children():
		if child.scene_file_path.get_file() != "BigCoin.tscn":
			continue
		found += 1
		if child.banked:
			ghosts.append(child.coin_id)
	assert_true(found > 0, "world two has big coins to check (%d)" % found)
	assert_eq(ghosts.size(), 0,
		"a level opened for the first time has no coins already banked; ghosted: %s" % str(ghosts))

	game.free()
	data["levelRecords"] = before
	_levels().set_current_level(was_level)
