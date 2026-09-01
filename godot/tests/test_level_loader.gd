extends TestCase
## Slice 4: verify the compiled Tiled JSON parses into the structure the builder
## and gameplay expect (dimensions, layers, collide ids, object spawns).

## THE FIRST STORY LEVEL, whichever one that is.
##
## This used to name res://data/levels/compiled/level_01_forest.json and assert a
## width of 112. Both were facts about one level rather than about the loader, so
## when the levels were rebuilt as zone acts the file stopped existing, FileAccess
## returned null, and every test in here threw on a null before it could fail --
## which is worse than failing, because the summary still read "0 failed".
##
## The path comes from the registry now and the dimensions are compared against
## the level's OWN header. What is being tested is that the loader reproduces the
## file it was given, which is true of any level.
var _level: Dictionary = {}
var _parsed: Dictionary = {}

func _level_path() -> String:
	for entry in LevelManager.get_levels():
		var key := String((entry as Dictionary).get("key", ""))
		if key == "level_99":
			continue
		return "res://%s" % LevelManager.map_file(key)
	return ""

## Per-test setup: parse the compiled level once, then reuse it.
func _reset() -> void:
	if _level.is_empty():
		var path := _level_path()
		var f := FileAccess.open(path, FileAccess.READ)
		if f == null:
			return
		_level = JSON.parse_string(f.get_as_text())
		f.close()
		_parsed = LevelLoader.parse(_level)

func test_dimensions() -> void:
	assert_true(not _parsed.is_empty(), "the first story level's map file loads")
	if _parsed.is_empty():
		return
	assert_eq(_parsed["width"], int(_level["width"]), "width matches the file's own header")
	assert_eq(_parsed["height"], int(_level["height"]), "height matches the file's own header")
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
			assert_eq((l["data"] as Array).size(), int(_level["width"]) * int(_level["height"]),
				"ground data covers the whole grid")

## Every tile the ground layer places has to collide, and nothing in the
## decoration layer may.
##
## This used to assert the literal list [0, 1, 2], which is the compiler's answer
## rather than the requirement -- so the day the compiler learned to place end
## caps, a correct change failed a test that was describing an old fact. Assert
## the property instead: whatever the ground layer holds, the loader must have
## baked collision onto it.
func test_collide_ids() -> void:
	var collide: Array = _parsed["tileset"]["collide_ids"]
	var firstgid: int = int(_parsed["tileset"]["firstgid"])
	assert_true(collide.size() > 0, "some tiles collide")
	assert_true(LevelLoader.count_collision_cells(_parsed) > 0, "some collision cells exist")

	var ground_ids := {}
	var decoration_ids := {}
	for l in _parsed["tile_layers"]:
		var into: Dictionary = ground_ids if l["name"] == "ground" else decoration_ids
		if l["name"] != "ground" and l["name"] != "decoration":
			continue
		for gid in l["data"]:
			if int(gid) != 0:
				into[int(gid) - firstgid] = true

	assert_true(ground_ids.size() > 0, "the ground layer places something")
	for id in ground_ids:
		assert_true(collide.has(id),
			"ground tile %d collides -- a ledge a player can stand through is not a ledge" % id)
	assert_true(decoration_ids.size() > 0, "the decoration layer places something")
	for id in decoration_ids:
		assert_true(not collide.has(id),
			"decoration tile %d does not collide -- a tuft of grass is not a wall" % id)

## Object properties reach `props`, which is the whole reason spawns are parsed
## rather than positioned.
##
## This used to keep the LAST npc it saw and assert it was owl_teacher_01, which
## broke the moment a bonus owl was appended to level_01 -- it was pinned to the
## level's cast list rather than to the parser. It asserts the FLAGS on the bonus
## owl now, which is a stronger check of the same thing: three properties of three
## different kinds off one object, including the boolean that decides whether the
## door waits for it.
func test_object_spawns() -> void:
	var types := {}
	var player_spawn: Variant = null
	var bonus_owl: Variant = null
	var npcs := 0
	for s in _parsed["spawns"]:
		types[s["type"]] = true
		if s["type"] == "player_spawn":
			player_spawn = s
		elif s["type"] == "npc":
			npcs += 1
			if bool(s["props"].get("bonus", false)):
				bonus_owl = s
	assert_true(player_spawn != null, "has player_spawn")
	assert_true(npcs >= 2, "the level spawns its owls (%d)" % npcs)
	assert_true(bonus_owl != null, "and one of them is flagged as the bonus owl")
	if bonus_owl != null:
		assert_true(String(bonus_owl["props"].get("npc_id", "")) != "",
			"a string property parsed")
		assert_eq(bool(bonus_owl["props"].get("bonus", false)), true,
			"a bool property parsed -- this is what keeps the door from waiting for it")
		assert_eq(String(bonus_owl["props"].get("requires_ability", "")), "double_jump",
			"and the ability it is gated behind")

func test_image_path_resolution() -> void:
	assert_eq(LevelLoader.resolve_image_path("../../assets/tilesets/forest_tiles.png"), "res://assets/tilesets/forest_tiles.png", "image path")
