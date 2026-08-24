extends TestCase
## Every NPC in every level stands on the ground.
##
## This existed as a bug in all six levels at once and nothing noticed, because
## the only thing that ever checked entity placement was someone looking at a
## screenshot of level_01. The owls were a full sprite height underground -
## buried, heads below the grass - and the suite was green.
##
## The player spawn had the same 64px error in levels 03, 04 and 05, from the
## opposite cause: NPC objects are authored bottom-origin and the code was adding
## height, while the player box is authored top-origin and those three specs
## placed its top on the surface instead of two tiles above it. Being a physics
## body does not save it - a body spawned inside static geometry stays there, so
## the crow simply started buried. Hence this checks both.

const LEVELS_DIR := "res://data/levels/compiled"
## The sprite's feet sit a pixel above its origin, and a level may legitimately
## place an NPC on a ledge. This only has to catch burial.
const TOLERANCE := 4.0

func _reset() -> void:
	_failures.clear()
	_assertions = 0

func _levels() -> Array:
	var out: Array = []
	var dir := DirAccess.open(LEVELS_DIR)
	if dir == null:
		return out
	for name in dir.get_files():
		if name.ends_with(".json"):
			out.append("%s/%s" % [LEVELS_DIR, name])
	out.sort()
	return out

func _read(path: String) -> Dictionary:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	return parsed if typeof(parsed) == TYPE_DICTIONARY else {}

## Top of the solid ground under `x`, ignoring floating platforms: walk up from
## the bottom of the column and stop at the first gap.
func _surface_y(level: Dictionary, x: float) -> float:
	var tile_w := int(level.get("tilewidth", 32))
	var tile_h := int(level.get("tileheight", 32))
	for layer in level.get("layers", []):
		if String(layer.get("type", "")) != "tilelayer" or String(layer.get("name", "")) != "ground":
			continue
		var w := int(layer["width"])
		var h := int(layer["height"])
		var data: Array = layer["data"]
		var col := int(x) / tile_w
		if col < 0 or col >= w:
			return -1.0
		var top := -1
		for row in range(h - 1, -1, -1):
			if int(data[row * w + col]) != 0:
				top = row
			elif top != -1:
				break
		return float(top * tile_h) if top != -1 else -1.0
	return -1.0

func test_no_npc_is_underground() -> void:
	var levels := _levels()
	assert_true(levels.size() > 0, "compiled levels are readable")
	var checked := 0
	for path in levels:
		var level := _read(path)
		for layer in level.get("layers", []):
			if String(layer.get("type", "")) != "objectgroup":
				continue
			for obj in layer.get("objects", []):
				if String(obj.get("type", "")) != "npc":
					continue
				var feet := Npc.feet_from_spawn(obj)
				var surface := _surface_y(level, feet.x)
				if surface < 0.0:
					continue  # no solid column here; the level means it to float
				checked += 1
				assert_true(feet.y <= surface + TOLERANCE,
					"%s: NPC at x=%d has its feet at y=%d, ground is at y=%d (%d px under)" % [
						path.get_file(), int(feet.x), int(feet.y), int(surface), int(feet.y - surface)])
	assert_true(checked >= 20, "every level's NPCs were checked, not just one")

## The player box is authored top-origin, so its feet are y + height. Same
## question, different convention - and it was wrong in half the levels.
func test_player_never_spawns_inside_the_ground() -> void:
	var checked := 0
	for path in _levels():
		var level := _read(path)
		for layer in level.get("layers", []):
			if String(layer.get("type", "")) != "objectgroup":
				continue
			for obj in layer.get("objects", []):
				if String(obj.get("type", "")) != "player_spawn":
					continue
				var feet := float(obj["y"]) + float(obj["height"])
				var surface := _surface_y(level, float(obj["x"]) + float(obj["width"]) * 0.5)
				if surface < 0.0:
					continue
				checked += 1
				assert_true(feet <= surface + TOLERANCE,
					"%s: player spawns with its feet at y=%d, ground is at y=%d (%d px under)" % [
						path.get_file(), int(feet), int(surface), int(feet - surface)])
	assert_true(checked >= 5, "every level's player spawn was checked")

## The other half: an NPC hovering high above the ground is just as wrong, and a
## fix that simply subtracted a constant would sail past a floor-only check.
func test_no_npc_floats_far_above_the_ground() -> void:
	for path in _levels():
		var level := _read(path)
		for layer in level.get("layers", []):
			if String(layer.get("type", "")) != "objectgroup":
				continue
			for obj in layer.get("objects", []):
				if String(obj.get("type", "")) != "npc":
					continue
				var feet := Npc.feet_from_spawn(obj)
				var surface := _surface_y(level, feet.x)
				if surface < 0.0:
					continue
				assert_true(surface - feet.y <= 64.0,
					"%s: NPC at x=%d hovers %d px above the ground" % [
						path.get_file(), int(feet.x), int(surface - feet.y)])
