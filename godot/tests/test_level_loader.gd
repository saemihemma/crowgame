extends TestCase
## Slice 4: verify the compiled Tiled JSON parses into the structure the builder
## and gameplay expect (dimensions, layers, collide ids, object spawns).

const LEVEL_PATH := "res://data/levels/compiled/level_01_forest.json"

var _level: Dictionary = {}
var _parsed: Dictionary = {}

## Per-test setup: parse the compiled level once, then reuse it.
func _reset() -> void:
	if _level.is_empty():
		var f := FileAccess.open(LEVEL_PATH, FileAccess.READ)
		_level = JSON.parse_string(f.get_as_text())
		f.close()
		_parsed = LevelLoader.parse(_level)

func test_dimensions() -> void:
	assert_eq(_parsed["width"], 112, "width")
	assert_eq(_parsed["height"], 20, "height")
	assert_eq(_parsed["tile_w"], 32, "tile width")
	assert_eq(_parsed["tile_h"], 32, "tile height")

func test_tile_layers() -> void:
	var names: Array = []
	for l in _parsed["tile_layers"]:
		names.append(l["name"])
	assert_true(names.has("background"), "has background")
	assert_true(names.has("ground"), "has ground")
	assert_true(names.has("decoration"), "has decoration")
	# ground data covers the whole grid.
	for l in _parsed["tile_layers"]:
		if l["name"] == "ground":
			assert_eq((l["data"] as Array).size(), 112 * 20, "ground data length")

func test_collide_ids() -> void:
	assert_eq(_parsed["tileset"]["collide_ids"], [0, 1, 2], "collide ids (gids 1/2/3)")
	assert_true(LevelLoader.count_collision_cells(_parsed) > 0, "some collision cells exist")

func test_object_spawns() -> void:
	var types := {}
	var player_spawn: Variant = null
	var npc: Variant = null
	for s in _parsed["spawns"]:
		types[s["type"]] = true
		if s["type"] == "player_spawn":
			player_spawn = s
		elif s["type"] == "npc":
			npc = s
	assert_true(player_spawn != null, "has player_spawn")
	assert_true(npc != null, "has npc")
	if npc != null:
		assert_eq(String(npc["props"].get("npc_id", "")), "owl_teacher_01", "npc_id property parsed")

func test_image_path_resolution() -> void:
	assert_eq(LevelLoader.resolve_image_path("../../assets/tilesets/forest_tiles.png"), "res://assets/tilesets/forest_tiles.png", "image path")
