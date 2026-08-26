extends SceneTree
## Tier-3 editor-authoring importer. Converts the compiled Tiled JSON levels into
## EDITABLE Godot scenes: a shared TileSet .tres per tileset image plus a level
## .tscn with background/ground/decoration TileMapLayers and a Spawns node of
## Marker2Ds. After running, levels open in Godot's TileMap editor and new levels
## can be authored natively. The runtime LevelLoader stays as the parity path.
##
## Run: godot --headless --path godot --script res://tools/import_level.gd
##
## ITS OUTPUT IS NOT COMMITTED. A previous run's six level scenes and one TileSet
## were, and they went stale: nothing at runtime read them, they still referenced
## the retired `forest` theme, and because `godot/scenes/**` is exported they were
## shipping in the pck. Regenerate when you want to author in the editor; commit a
## scene only once it is the authored source for a level rather than a copy of the
## compiled JSON.

const COMPILED_DIR := "res://data/levels/compiled"
const TILESET_OUT := "res://resources/tilesets"
const SCENE_OUT := "res://scenes/levels"

func _init() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(TILESET_OUT))
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(SCENE_OUT))
	var count := 0
	var dir := DirAccess.open(COMPILED_DIR)
	dir.list_dir_begin()
	var fname := dir.get_next()
	while fname != "":
		if fname.ends_with(".json"):
			_convert("%s/%s" % [COMPILED_DIR, fname], fname.get_basename())
			count += 1
		fname = dir.get_next()
	dir.list_dir_end()
	print("[import_level] converted %d level(s)" % count)
	quit(0)

func _convert(json_path: String, key: String) -> void:
	var f := FileAccess.open(json_path, FileAccess.READ)
	var level: Dictionary = JSON.parse_string(f.get_as_text())
	f.close()
	var parsed := LevelLoader.parse(level)

	# Shared TileSet per tileset image (dedup by basename).
	var image_name := String(parsed["tileset"]["image"]).get_file().get_basename()
	var ts_path := "%s/%s.tres" % [TILESET_OUT, image_name]
	var tile_set: TileSet
	if ResourceLoader.exists(ts_path):
		tile_set = load(ts_path)
	else:
		tile_set = LevelLoader.build_tileset(parsed)
		ResourceSaver.save(tile_set, ts_path)
		tile_set = load(ts_path)

	var firstgid: int = parsed["tileset"]["firstgid"]
	var columns: int = maxi(1, int(parsed["tileset"]["columns"]))
	var width: int = parsed["width"]

	var root := Node2D.new()
	root.name = "Level_%s" % key

	for layer in parsed["tile_layers"]:
		var tml := TileMapLayer.new()
		tml.name = layer["name"]
		tml.tile_set = tile_set
		tml.collision_enabled = LevelLoader.COLLIDABLE_LAYERS.has(layer["name"])
		var data: Array = layer["data"]
		for i in data.size():
			var gid := int(data[i])
			if gid == 0:
				continue
			var id := gid - firstgid
			if id < 0:
				continue
			tml.set_cell(Vector2i(i % width, i / width), 0, Vector2i(id % columns, id / columns))
		root.add_child(tml)
		tml.owner = root

	var spawns := Node2D.new()
	spawns.name = "Spawns"
	root.add_child(spawns)
	spawns.owner = root
	for s in parsed["spawns"]:
		var m := Marker2D.new()
		m.name = "%s_%d_%d" % [s["type"], int(s["x"]), int(s["y"])]
		m.position = Vector2(s["x"], s["y"])
		m.set_meta("type", s["type"])
		m.set_meta("width", s["width"])
		m.set_meta("height", s["height"])
		m.set_meta("props", s["props"])
		spawns.add_child(m)
		m.owner = root

	var packed := PackedScene.new()
	packed.pack(root)
	var scene_path := "%s/%s.tscn" % [SCENE_OUT, key]
	var err := ResourceSaver.save(packed, scene_path)
	print("  %s -> %s (%s)" % [key, scene_path, "ok" if err == OK else "ERR %d" % err])
	root.free()  # release the temporary build tree (avoids leak warnings at exit)
