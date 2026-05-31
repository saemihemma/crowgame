extends RefCounted
class_name LevelLoader
## Runtime loader for compiled Tiled JSON (data/levels/compiled/*.json).
##
## Two responsibilities, kept separate so parsing is unit-testable:
##   parse(level)  -> a normalized Dictionary (pure; no nodes)
##   build(parent, level) -> instantiates TileMapLayer nodes + a TileSet and
##                            returns parsed data incl. object spawns.
##
## Tier-3 note: this is the parity/fallback path. The editor-authoring path
## (tools/import_level.gd) reuses _build_tileset() to emit editable .tscn scenes.
## Collision is per-layer: only the "ground" layer enables collision, matching
## the Phaser GameScene which sets collision on the ground layer for gids 1/2/3.

const COLLIDABLE_LAYERS := ["ground"]

## Normalize a compiled level dict into a flat structure (pure).
static func parse(level: Dictionary) -> Dictionary:
	var tilesets: Array = level.get("tilesets", [])
	var ts: Dictionary = tilesets[0] if tilesets.size() > 0 else {}
	var collide_ids: Array = []
	for t in ts.get("tiles", []):
		for p in t.get("properties", []):
			if String(p.get("name", "")) == "collides" and bool(p.get("value", false)):
				collide_ids.append(int(t.get("id", -1)))

	var tile_layers: Array = []
	var spawns: Array = []
	for layer in level.get("layers", []):
		match String(layer.get("type", "")):
			"tilelayer":
				tile_layers.append({
					"name": String(layer.get("name", "")),
					"data": layer.get("data", []),
				})
			"objectgroup":
				for obj in layer.get("objects", []):
					spawns.append(_parse_object(obj))

	return {
		"width": int(level.get("width", 0)),
		"height": int(level.get("height", 0)),
		"tile_w": int(level.get("tilewidth", 32)),
		"tile_h": int(level.get("tileheight", 32)),
		"tileset": {
			"firstgid": int(ts.get("firstgid", 1)),
			"columns": int(ts.get("columns", 1)),
			"tilecount": int(ts.get("tilecount", 0)),
			"image": String(ts.get("image", "")),
			"image_w": int(ts.get("imagewidth", 0)),
			"image_h": int(ts.get("imageheight", 0)),
			"collide_ids": collide_ids,
		},
		"tile_layers": tile_layers,
		"spawns": spawns,
	}

static func _parse_object(obj: Dictionary) -> Dictionary:
	var props := {}
	for p in obj.get("properties", []):
		props[String(p.get("name", ""))] = p.get("value")
	return {
		"type": String(obj.get("type", "")),
		"name": String(obj.get("name", "")),
		"x": float(obj.get("x", 0)),
		"y": float(obj.get("y", 0)),
		"width": float(obj.get("width", 0)),
		"height": float(obj.get("height", 0)),
		"props": props,
	}

## Count colliding cells across the ground layer(s) — used by parity tests.
static func count_collision_cells(parsed: Dictionary) -> int:
	var firstgid: int = parsed["tileset"]["firstgid"]
	var collide_ids: Array = parsed["tileset"]["collide_ids"]
	var n := 0
	for layer in parsed["tile_layers"]:
		if not COLLIDABLE_LAYERS.has(layer["name"]):
			continue
		for gid in layer["data"]:
			if int(gid) == 0:
				continue
			if collide_ids.has(int(gid) - firstgid):
				n += 1
	return n

## Resolve a Tiled tileset image path (e.g. "../../assets/tilesets/x.png") to res://.
static func resolve_image_path(image: String) -> String:
	var name := image.get_file()  # strip ../.. prefix
	return "res://assets/tilesets/%s" % name

## Build a Godot TileSet (atlas source) from a parsed tileset, baking square
## collision polygons onto the collidable tile ids.
static func build_tileset(parsed: Dictionary) -> TileSet:
	var ts_def: Dictionary = parsed["tileset"]
	var tw: int = parsed["tile_w"]
	var th: int = parsed["tile_h"]
	var tex_path := resolve_image_path(ts_def["image"])
	var tex: Texture2D = load(tex_path) if ResourceLoader.exists(tex_path) else null

	var tile_set := TileSet.new()
	tile_set.tile_size = Vector2i(tw, th)
	tile_set.add_physics_layer(0)

	var src := TileSetAtlasSource.new()
	if tex != null:
		src.texture = tex
	src.texture_region_size = Vector2i(tw, th)
	tile_set.add_source(src, 0)

	var columns: int = maxi(1, int(ts_def["columns"]))
	var count: int = int(ts_def["tilecount"])
	var collide_ids: Array = ts_def["collide_ids"]
	for id in count:
		var coords := Vector2i(id % columns, id / columns)
		if not src.has_tile(coords):
			src.create_tile(coords)
		if collide_ids.has(id):
			var td := src.get_tile_data(coords, 0)
			# Full-tile square collision polygon (centered on the tile).
			var hw := tw / 2.0
			var hh := th / 2.0
			td.add_collision_polygon(0)
			td.set_collision_polygon_points(0, 0, PackedVector2Array([
				Vector2(-hw, -hh), Vector2(hw, -hh), Vector2(hw, hh), Vector2(-hw, hh),
			]))
	return tile_set

## Instantiate TileMapLayer nodes under `parent` and return parsed data.
static func build(parent: Node, level: Dictionary) -> Dictionary:
	var parsed := parse(level)
	var tile_set := build_tileset(parsed)
	var firstgid: int = parsed["tileset"]["firstgid"]
	var columns: int = maxi(1, int(parsed["tileset"]["columns"]))
	var width: int = parsed["width"]

	for layer in parsed["tile_layers"]:
		var tml := TileMapLayer.new()
		tml.name = layer["name"]
		tml.tile_set = tile_set
		tml.collision_enabled = COLLIDABLE_LAYERS.has(layer["name"])
		var data: Array = layer["data"]
		for i in data.size():
			var gid := int(data[i])
			if gid == 0:
				continue
			var id := gid - firstgid
			if id < 0:
				continue
			var coords := Vector2i(i % width, i / width)
			tml.set_cell(coords, 0, Vector2i(id % columns, id / columns))
		parent.add_child(tml)
	return parsed
