extends TestCase
## Anything that cuts ONE frame out of a sheet must take the cell size from the
## registry, not from a literal.
##
## coin_chip.gd used to hold `const COIN_FRAME := 32` and slice
## `Rect2(0, 0, COIN_FRAME, COIN_FRAME)` out of a sheet it had just fetched
## through SpriteSheet. That agreed with the registry only by coincidence. The
## day the `pickup` class is retargeted — a 48px coin, a 144x144 sheet — the chip
## keeps cutting a 32x32 corner and renders two-thirds of one coin. Nothing
## errors, no test fails, and the obvious conclusion is that the new art is bad.
##
## Sizes here are driven past what the project ships, because a test that only
## ever sees 32 cannot tell a derived value from a hardcoded one.


func _spec_size(cls: String) -> Vector2i:
	var c: Dictionary = DataManager.get_dict("SPRITE_SPEC").get("classes", {}).get(cls, {})
	return Vector2i(int(c.get("frameWidth", 0)), int(c.get("frameHeight", 0)))

# --- the helper ------------------------------------------------------------

func test_frame_size_comes_from_the_class_not_the_sheet() -> void:
	# A 96x96 coin sheet holds 3x3 cells of 32. The cell is what callers want;
	# the sheet size is the wrong answer and the easy one to return by accident.
	for key in DataManager.get_dict("SPRITE_REGISTRY").get("sprites", {}):
		var raw := SpriteSheet.raw_entry(key)
		var cls := String(raw.get("class", ""))
		var expected := _spec_size(cls)
		if raw.has("frameWidth"):
			expected.x = int(raw["frameWidth"])
		if raw.has("frameHeight"):
			expected.y = int(raw["frameHeight"])
		assert_eq(SpriteSheet.frame_size(key), expected,
			"'%s' cell size comes from class '%s' (or its recorded override)" % [key, cls])

func test_frame_size_is_a_cell_not_the_whole_sheet() -> void:
	# Only meaningful on a multi-frame sheet — where the two genuinely differ.
	for key in ["coin", "crow_walk", "door"]:
		var tex := SpriteSheet.texture(key)
		if tex == null:
			continue
		var cell := SpriteSheet.frame_size(key)
		var frames := int(SpriteSheet.entry(key).get("frames", 1))
		if frames <= 1:
			continue
		assert_true(cell.x < tex.get_width() or cell.y < tex.get_height(),
			"'%s' cell (%dx%d) is smaller than its sheet (%dx%d)"
				% [key, cell.x, cell.y, tex.get_width(), tex.get_height()])

func test_unknown_key_does_not_crop_to_nothing() -> void:
	assert_eq(SpriteSheet.frame_size("no_such_sprite"), Vector2i.ZERO,
		"an unknown key yields no cell rather than a bogus one")

# --- the live chip ---------------------------------------------------------

## Crosses from a rendered node back to the spec JSON. Those are two independent
## sources today, which is what stops this being a restatement of the fix.
func test_coin_chip_slices_the_cell_the_spec_declares() -> void:
	var chip := CoinChip.new()
	Engine.get_main_loop().root.add_child(chip)

	var atlas: AtlasTexture = null
	for child in chip.get_children():
		if child is TextureRect and (child as TextureRect).texture is AtlasTexture:
			atlas = (child as TextureRect).texture as AtlasTexture
			break

	if SpriteSheet.texture("coin") == null:
		chip.queue_free()
		return

	assert_true(atlas != null, "the chip slices its coin through an AtlasTexture")
	if atlas != null:
		var declared := _spec_size(String(SpriteSheet.raw_entry("coin").get("class", "")))
		assert_eq(Vector2i(atlas.region.size), declared,
			"the chip cuts exactly the cell brand/ASSET_MANIFEST specifies for a pickup")
		assert_eq(atlas.region.position, Vector2.ZERO, "it takes the rest frame, frame 0")
	chip.queue_free()

## The mutation that motivated this: putting the literal back as a bare
## `Rect2(0, 0, 32, 32)` slipped past a check that only knew the old constant's
## name. So scan for the shape, not the name — any sheet slice built from plain
## numbers instead of the registry.
func test_no_ui_component_slices_a_sheet_with_literal_numbers() -> void:
	var dir := DirAccess.open("res://scripts/ui/components")
	if dir == null:
		return
	dir.list_dir_begin()
	var fname := dir.get_next()
	while fname != "":
		if fname.ends_with(".gd"):
			var f := FileAccess.open("res://scripts/ui/components/%s" % fname, FileAccess.READ)
			if f != null:
				var lineno := 0
				for line in f.get_as_text().split("\n"):
					lineno += 1
					var t := line.strip_edges()
					if t.begins_with("#"):
						continue
					if not t.contains("Rect2("):
						continue
					# A slice is only suspect when it feeds an atlas region.
					if not t.contains("region"):
						continue
					var inside := t.substr(t.find("Rect2(") + 6)
					var digits := 0
					for part in inside.split(","):
						if part.strip_edges().trim_suffix(")").is_valid_int():
							digits += 1
					assert_true(digits < 3,
						"%s:%d builds an atlas region from literals — use SpriteSheet.frame_size(): %s"
							% [fname, lineno, t])
				f.close()
		fname = dir.get_next()
	dir.list_dir_end()
