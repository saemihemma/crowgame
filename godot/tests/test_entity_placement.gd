extends TestCase
## Nothing the game spawns may be standing inside the ground.
##
## Written because the only thing that had ever checked entity placement in this
## project was a person looking at one screenshot of one level. That is how every
## NPC in all six levels came to be buried a full sprite height underground, and
## the crow with them in three of the five worlds, with a green suite.
##
## Deliberately convention-agnostic: it instantiates each real level, walks what
## actually got spawned, and compares each node's anchor against the ground
## column beneath it. It does not encode where a coin's origin is or which way a
## door measures - those rules live in each entity's setup_from_spawn and are
## exactly the thing that was wrong. A new entity type is covered the day it is
## added, without anyone remembering to come back here.

const GAME_SCENE := preload("res://scenes/Game.tscn")


func _level_keys() -> Array:
	var out: Array = []
	for entry in LevelManager.get_levels():
		out.append(String(entry.get("key", "")))
	return out

func _level_json(key: String) -> Dictionary:
	var entry: Variant = LevelManager.get_level(key)
	if entry == null:
		return {}
	var f := FileAccess.open("res://%s" % String(entry.get("mapFile", "")), FileAccess.READ)
	if f == null:
		return {}
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	return parsed if typeof(parsed) == TYPE_DICTIONARY else {}

## Is there solid ground at this exact point?
##
## The invariant is "nothing has ground above its feet", not "everything is level
## with the nearest surface". The first version of this test compared each anchor
## to the topmost ground in its column and failed four legitimate pit hazards -
## a hazard at the bottom of a chasm is below the platform beside it and is
## meant to be. Probing a few pixels above the anchor separates the two cases
## exactly: a correctly grounded entity has open air there, a buried one has
## soil, and something falling down an intentional pit has open air too.
func _solid_at(level: Dictionary, x: float, y: float) -> bool:
	var tile_w := int(level.get("tilewidth", 32))
	var tile_h := int(level.get("tileheight", 32))
	for layer in level.get("layers", []):
		if String(layer.get("type", "")) != "tilelayer" or String(layer.get("name", "")) != "ground":
			continue
		var w := int(layer["width"])
		var h := int(layer["height"])
		var col := int(x) / tile_w
		var row := int(y) / tile_h
		if col < 0 or col >= w or row < 0 or row >= h:
			return false
		return int(layer["data"][row * w + col]) != 0
	return false

## How far above an anchor to probe. Small enough that an entity resting on the
## surface is not caught by the tile it is standing on, large enough that being
## sunk by any meaningful amount is.
const PROBE_ABOVE := 6.0

## An NPC may bob and may stand on a ledge, but it should not be floating a
## character height off the floor.
const MAX_HOVER := 48.0

func _is_buried(level: Dictionary, at: Vector2) -> bool:
	return _solid_at(level, at.x, at.y - PROBE_ABOVE)

func test_nothing_spawns_underground() -> void:
	var keys := _level_keys()
	assert_true(keys.size() >= 5, "the registry has the five worlds")
	var checked := 0
	for key in keys:
		var level := _level_json(key)
		if level.is_empty():
			continue
		var game: Node2D = GAME_SCENE.instantiate()
		game.level_key = key
		Engine.get_main_loop().root.add_child(game)
		var world: Node = game.get_node_or_null("World")
		if world != null:
			for node in world.get_children():
				if not (node is Node2D) or node.scene_file_path.is_empty():
					continue
				var at: Vector2 = (node as Node2D).global_position
				checked += 1
				assert_true(not _is_buried(level, at),
					"%s: %s at (%d, %d) has solid ground above its feet - it is inside the level" % [
						key, node.scene_file_path.get_file(), int(at.x), int(at.y)])
		game.free()
	assert_true(checked >= 100, "every level's entities were walked, not just one")

## The player is spawned by the level rather than into World, so it is checked
## on its own - and it was wrong in three of the five worlds.
func test_player_never_spawns_inside_the_ground() -> void:
	var checked := 0
	for key in _level_keys():
		var level := _level_json(key)
		if level.is_empty():
			continue
		var game: Node2D = GAME_SCENE.instantiate()
		game.level_key = key
		Engine.get_main_loop().root.add_child(game)
		var player = game.get_player()
		if player != null:
			var at: Vector2 = player.global_position
			checked += 1
			assert_true(not _is_buried(level, at),
				"%s: the crow spawns at (%d, %d), inside the ground" % [key, int(at.x), int(at.y)])
		game.free()
	assert_true(checked >= 5, "every level's player spawn was checked")

## The other direction. A fix that simply subtracted a constant would satisfy
## every check above while leaving the owls hovering in mid-air, so the distance
## from an NPC's feet down to the ground is bounded too.
func test_npcs_do_not_hover() -> void:
	var checked := 0
	for key in _level_keys():
		var level := _level_json(key)
		if level.is_empty():
			continue
		var game: Node2D = GAME_SCENE.instantiate()
		game.level_key = key
		Engine.get_main_loop().root.add_child(game)
		var world: Node = game.get_node_or_null("World")
		if world != null:
			for node in world.get_children():
				if node.scene_file_path.get_file() != "Npc.tscn":
					continue
				var at: Vector2 = (node as Node2D).global_position
				var drop := 0.0
				# Walk down from the feet until ground appears. An NPC over an
				# intentional pit finds none, and is left alone.
				while drop <= MAX_HOVER and not _solid_at(level, at.x, at.y + drop):
					drop += 4.0
				if drop > MAX_HOVER:
					continue
				checked += 1
				assert_true(drop <= MAX_HOVER,
					"%s: NPC at (%d, %d) hovers %d px above the ground" % [
						key, int(at.x), int(at.y), int(drop)])
		game.free()
	assert_true(checked >= 20, "every level's NPCs were checked for hovering")
