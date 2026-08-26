extends TestCase
## The collider has to be the drawing.
##
## Written because "the collision bubble feels much bigger than the asset" is a
## real thing to feel and nothing in this project measured it. Two halves of the
## world can drift apart here and no other test notices: a tile whose collision
## square covers pixels the art leaves empty, and a character whose box sticks
## out past its own silhouette. Both read to a player as the game stopping them
## against thin air.
##
## Everything below measures the shipped PNGs. Nothing is asserted against a
## number typed into this file, because a number typed into this file is exactly
## how the collider and the art come apart in the first place.

const TILE_MANIFEST := "res://data/tilesets/tileset_manifest.json"
const WALK_SPRITE_KEY := "crow_walk"

## A colliding tile is checked two ways, because one number cannot say it.
##
## Coverage catches a hole in the middle. The bounding box catches the thing a
## player actually feels: an edge of solid nothing. A tile can be 90% drawn and
## still be a floor - the shipped grass sheets carry a soft top row or two - but
## it may not be 90% drawn with a quarter-tile bitten off one side.
const SOLID_COVERAGE := 0.90
## How many pixels of the tile's own edge the art may leave empty. Two, so a
## soft grass line passes and a missing corner does not.
const EDGE_SLACK := 2
## A tile that does not collide has to be visibly not a floor - a scatter mark,
## not a slab.
const DECORATION_COVERAGE := 0.5

func _json(path: String) -> Dictionary:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	return parsed if typeof(parsed) == TYPE_DICTIONARY else {}

## Coverage and opaque bounding box of one tile, in tile-local coordinates.
## Returns {coverage, left, top, right, bottom}; the box is empty when nothing
## in the tile is drawn.
func _measure(img: Image, x0: int, y0: int, w: int, h: int) -> Dictionary:
	var opaque := 0
	var left := w
	var top := h
	var right := -1
	var bottom := -1
	for y in range(y0, y0 + h):
		for x in range(x0, x0 + w):
			if img.get_pixel(x, y).a > 0.03:
				opaque += 1
				left = mini(left, x - x0)
				right = maxi(right, x - x0)
				top = mini(top, y - y0)
				bottom = maxi(bottom, y - y0)
	return {"coverage": float(opaque) / float(w * h),
			"left": left, "top": top, "right": right, "bottom": bottom}

func test_a_tile_collides_exactly_when_it_is_drawn_as_a_floor() -> void:
	var manifest := _json(TILE_MANIFEST)
	var tw := int(manifest.get("tileWidth", 32))
	var th := int(manifest.get("tileHeight", 32))
	var cols := int(manifest.get("columns", 4))
	var checked := 0
	for ts in manifest.get("tilesets", []):
		var path := "res://%s" % String(ts.get("image", ""))
		var tex: Texture2D = load(path) if ResourceLoader.exists(path) else null
		assert_true(tex != null, "tileset %s loads" % String(ts.get("key", "")))
		if tex == null:
			continue
		var img := tex.get_image()
		for tile in ts.get("tiles", []):
			var id := int(tile.get("index", 0))
			var m := _measure(img, (id % cols) * tw, (id / cols) * th, tw, th)
			var cover: float = m["coverage"]
			var collides: bool = bool(tile.get("collides", false))
			var key := String(ts.get("key", ""))
			var role := String(tile.get("role", ""))
			checked += 1
			if collides:
				assert_true(cover >= SOLID_COVERAGE,
					"%s tile %d (%s) collides but is only %.0f%% drawn - the square covers empty pixels" % [
						key, id, role, cover * 100.0])
				assert_true(int(m["right"]) >= 0,
					"%s tile %d (%s) collides but nothing is drawn in it at all - an invisible wall" % [
						key, id, role])
				if int(m["right"]) >= 0:
					assert_true(int(m["left"]) <= EDGE_SLACK and int(m["top"]) <= EDGE_SLACK
							and int(m["right"]) >= tw - 1 - EDGE_SLACK and int(m["bottom"]) >= th - 1 - EDGE_SLACK,
						"%s tile %d (%s) collides across the whole tile but is only drawn x%d..%d y%d..%d of %dx%d" % [
							key, id, role, int(m["left"]), int(m["right"]), int(m["top"]), int(m["bottom"]), tw, th])
			else:
				assert_true(cover <= DECORATION_COVERAGE,
					"%s tile %d (%s) is %.0f%% drawn but does not collide - it reads as a floor and is not one" % [
						key, id, role, cover * 100.0])
	assert_true(checked >= 40, "every world's tiles were measured, not just one (got %d)" % checked)

## The other half: a character's box must not reach outside its own drawing.
##
## Collision that ends INSIDE the art is a deliberate, common choice - this crow
## is 64px wide because of a tail and a beak, and a box around those would stop
## it a third of a tile from every wall. Collision that ends OUTSIDE the art is
## never right: there is nothing there to stop against.
func test_the_player_box_never_reaches_outside_the_crow() -> void:
	var box := SpriteSheet.body_box(WALK_SPRITE_KEY)
	assert_true(box != Vector2.ZERO, "the crow has a declared body box")
	if box == Vector2.ZERO:
		return
	var path := SpriteSheet.path_of(WALK_SPRITE_KEY)
	var tex: Texture2D = load(path) if ResourceLoader.exists(path) else null
	assert_true(tex != null, "the walk sheet loads")
	if tex == null:
		return
	var img := tex.get_image()
	var entry := SpriteSheet.entry(WALK_SPRITE_KEY)
	var fw := int(entry.get("frameWidth", 64))
	var fh := int(entry.get("frameHeight", 64))
	var cols := maxi(1, img.get_width() / fw)
	var rows := maxi(1, img.get_height() / fh)

	# `anchor: feet` puts the frame's bottom edge on the ground, and the box is
	# measured up from there - so in frame coordinates the box occupies the
	# bottom `box.y` rows, centred on the frame's width.
	var left := (fw - int(box.x)) / 2
	var right := left + int(box.x) - 1
	var top := fh - int(box.y)

	var frames := 0
	for fy in rows:
		for fx in cols:
			var lo := fw
			var hi := -1
			var first_row := fh
			for y in fh:
				for x in fw:
					if img.get_pixel(fx * fw + x, fy * fh + y).a > 0.03:
						lo = mini(lo, x)
						hi = maxi(hi, x)
						first_row = mini(first_row, y)
			if hi < 0:
				continue   # an unused cell in the sheet grid
			frames += 1
			assert_true(top >= first_row,
				"walk frame %d,%d: the box starts at row %d but the crow is only drawn from row %d - %dpx of collider above its head" % [
					fx, fy, top, first_row, first_row - top])
			assert_true(lo <= left and hi >= right,
				"walk frame %d,%d: the box spans x%d..%d but the crow is only drawn x%d..%d - collision outside the drawing" % [
					fx, fy, left, right, lo, hi])
	assert_true(frames >= 8, "every walk frame was measured (got %d)" % frames)
