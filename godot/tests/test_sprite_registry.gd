extends TestCase
## The sprite contract: sprite_spec.json says what each KIND of sprite must be,
## sprite_registry.json says what each asset IS, and nothing restates the other.
##
## Written because every sprite path and frame grid used to live as a literal in
## whichever .gd happened to draw it — twelve of them across eight files by the
## time this landed, plus six duplicated copies in npc_registry.json. Nothing
## checked that any of them still pointed at a real file, and nothing said what
## size a new sprite was supposed to be. brand/ASSET_MANIFEST.md stated the law
## in prose; this is the half a build can hold you to.
##
## The static half — orphaned files, import settings, off-spec sheet dimensions —
## is tools/check_assets.py, which runs without booting Godot.


func _registry() -> Dictionary:
	return DataManager.get_dict("SPRITE_REGISTRY").get("sprites", {})

func _is_optional(key: String) -> bool:
	return bool(SpriteSheet.raw_entry(key).get("optional", false))

func test_registry_and_spec_both_load() -> void:
	assert_true(_registry().size() > 0, "sprite_registry.json has sprites")
	assert_true(DataManager.get_dict("SPRITE_SPEC").get("classes", {}).size() > 0,
		"sprite_spec.json has classes")

func test_every_sprite_names_a_known_class() -> void:
	var classes: Dictionary = DataManager.get_dict("SPRITE_SPEC").get("classes", {})
	for key in _registry():
		var cls := String(SpriteSheet.raw_entry(key).get("class", ""))
		assert_true(classes.has(cls), "'%s' names a known class (got '%s')" % [key, cls])

func test_class_supplies_size_and_anchor() -> void:
	# A sprite must NOT have to restate its frame size — that is what makes one
	# edit to the spec retarget every sprite of a kind.
	for key in _registry():
		var raw := SpriteSheet.raw_entry(key)
		var resolved := SpriteSheet.entry(key)
		var defaults := SpriteSheet.class_defaults(String(raw.get("class", "")))
		for field in ["frameWidth", "frameHeight", "anchor"]:
			assert_true(resolved.has(field), "'%s' resolves %s" % [key, field])
			if not raw.has(field):
				assert_eq(resolved[field], defaults.get(field),
					"'%s' inherits %s from its class" % [key, field])

func test_overrides_are_justified() -> void:
	# Deviating from the spec is allowed. Doing it silently is not.
	for key in _registry():
		var raw := SpriteSheet.raw_entry(key)
		var defaults := SpriteSheet.class_defaults(String(raw.get("class", "")))
		for field in ["frameWidth", "frameHeight", "anchor"]:
			if raw.has(field) and raw[field] != defaults.get(field):
				assert_eq(SpriteSheet.entry(key)[field], raw[field],
					"'%s' override of %s wins over its class" % [key, field])
				assert_true(String(raw.get("why", "")).strip_edges() != "",
					"'%s' records why it deviates" % key)

func test_required_sprites_load() -> void:
	for key in _registry():
		if _is_optional(key):
			continue
		assert_true(SpriteSheet.texture(key) != null,
			"'%s' loads (%s)" % [key, SpriteSheet.path_of(key)])

func test_frame_grid_divides_each_sheet() -> void:
	for key in _registry():
		var tex := SpriteSheet.texture(key)
		if tex == null:
			continue
		var e := SpriteSheet.entry(key)
		var fw := int(e.get("frameWidth", 0))
		var fh := int(e.get("frameHeight", 0))
		assert_true(fw > 0 and fh > 0, "'%s' has a frame size" % key)
		if _is_optional(key) and not SpriteSheet.has_art(key):
			continue          # showing its fallback's texture, not its own
		assert_eq(tex.get_width() % fw, 0, "'%s' width %d divides by %d" % [key, tex.get_width(), fw])
		assert_eq(tex.get_height() % fh, 0, "'%s' height %d divides by %d" % [key, tex.get_height(), fh])

func test_declared_frames_fit_the_sheet() -> void:
	for key in _registry():
		var tex := SpriteSheet.texture(key)
		if tex == null or (_is_optional(key) and not SpriteSheet.has_art(key)):
			continue
		var e := SpriteSheet.entry(key)
		var cols := int(tex.get_width() / int(e.get("frameWidth", 1)))
		var rows := int(tex.get_height() / int(e.get("frameHeight", 1)))
		assert_true(int(e.get("frames", 1)) <= cols * rows,
			"'%s' declares %d frames, sheet holds %d" % [key, int(e.get("frames", 1)), cols * rows])

## An empty slot has to keep rendering something, or the day the registry names a
## file nobody has drawn yet the HUD goes blank instead of degrading.
func test_empty_optional_slots_fall_back() -> void:
	var any := false
	for key in _registry():
		var raw := SpriteSheet.raw_entry(key)
		if not bool(raw.get("optional", false)):
			continue
		var fb := String(raw.get("fallback", ""))
		if fb == "":
			continue
		any = true
		assert_true(_registry().has(fb), "'%s' falls back to a registered sprite '%s'" % [key, fb])
		if not SpriteSheet.has_art(key):
			assert_true(SpriteSheet.texture(key) != null,
				"'%s' is empty but still resolves a texture via '%s'" % [key, fb])
	assert_true(any, "at least one optional slot declares a fallback")

func test_npc_registry_sprite_keys_exist() -> void:
	for npc in DataManager.get_dict("NPC_REGISTRY").get("npcs", []):
		var key := String(npc.get("spriteKey", ""))
		assert_true(_registry().has(key),
			"npc '%s' sprite key '%s' is registered" % [npc.get("id", "?"), key])

func test_unknown_key_degrades_safely() -> void:
	assert_eq(SpriteSheet.path_of("no_such_sprite"), "", "unknown key yields no path")
	assert_true(SpriteSheet.texture("no_such_sprite") == null, "unknown key yields no texture")
	assert_true(SpriteSheet.frames("no_such_sprite") != null, "unknown key still yields SpriteFrames")
