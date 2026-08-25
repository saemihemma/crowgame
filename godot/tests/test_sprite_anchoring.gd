extends TestCase
## New art must not be broken by a number tuned for the art it replaces.
##
## Every world sprite used to carry `offset = Vector2(0, -28)` in its .tscn. That
## single number silently means two things at once: half the CURRENT 64px frame,
## plus the 4px grounding sink. Swap in a 96px-tall crow, update the registry, and
## the same -28 now means half of 96 minus 20 — the sink jumps from 4px to 20px and
## the new sprite renders buried. Nothing errors, and the obvious conclusion is
## that the new art is wrong.
##
## So anchors are derived at load from the registry. These tests drive the rule at
## frame heights the project does not ship, which is the only way to show it is not
## quietly fitted to today's 64px art.
##
## Placement of the entity itself — nothing standing inside the ground — is
## test_entity_placement.gd. This is only about where the frame sits on the node.


func _sink() -> float:
	return SpriteSheet.grounding_sink()

# --- the rule, at sizes we do not ship -------------------------------------

func test_feet_anchor_puts_frame_bottom_on_the_origin_at_any_height() -> void:
	for h in [16, 32, 48, 64, 72, 96, 100, 128, 250]:
		var off := SpriteSheet.compute_anchor_offset("feet", float(h))
		assert_eq(off.y + float(h) * 0.5, 0.0, "H=%d: frame bottom on the origin" % h)
		assert_eq(off.x, 0.0, "H=%d: no horizontal drift" % h)

func test_sink_stays_the_sink_at_every_frame_height() -> void:
	var sink := _sink()
	for h in [32, 64, 72, 96, 128]:
		var off := SpriteSheet.compute_anchor_offset("feet", float(h), sink)
		assert_eq(off.y + float(h) * 0.5, sink, "H=%d: sits exactly %s below the origin" % [h, sink])

func test_doubling_the_frame_height_does_not_double_the_sink() -> void:
	# The literal-offset bug in one assertion: with -28 baked in, 64 -> 128 turned
	# a 4px sink into a 36px one. Derived, it stays 4.
	var sink := _sink()
	assert_eq(SpriteSheet.compute_anchor_offset("feet", 64.0, sink).y + 32.0, sink, "64px frame")
	assert_eq(SpriteSheet.compute_anchor_offset("feet", 128.0, sink).y + 64.0, sink, "128px frame")

func test_center_anchor_ignores_frame_height() -> void:
	for h in [16, 32, 64, 96, 250]:
		assert_eq(SpriteSheet.compute_anchor_offset("center", float(h)), Vector2.ZERO,
			"H=%d: centred frame straddles the origin" % h)

# --- the helper against the real registry ----------------------------------

func test_anchor_offset_matches_the_rule_for_every_sprite() -> void:
	for key in DataManager.get_dict("SPRITE_REGISTRY").get("sprites", {}):
		var e := SpriteSheet.entry(key)
		var h := float(e.get("frameHeight", 0))
		var mode := String(e.get("anchor", "center"))
		var expected := Vector2(0.0, -h * 0.5) if mode == "feet" else Vector2.ZERO
		assert_eq(SpriteSheet.anchor_offset(key), expected,
			"'%s' (%s, H=%d) anchors from its frame height" % [key, mode, int(h)])

func test_sink_is_additive_not_scaled() -> void:
	for key in DataManager.get_dict("SPRITE_REGISTRY").get("sprites", {}):
		var plain := SpriteSheet.anchor_offset(key, 0.0)
		var sunk := SpriteSheet.anchor_offset(key, 7.0)
		assert_eq(sunk - plain, Vector2(0.0, 7.0), "'%s' sink is additive" % key)

func test_unknown_sprite_is_inert() -> void:
	assert_eq(SpriteSheet.anchor_offset("no_such_sprite"), Vector2.ZERO, "unknown key anchors at zero")

# --- what the live scenes actually get -------------------------------------

## The derived values must equal what the .tscn literals used to hold, or this
## change would have silently moved every sprite on screen.
func test_live_entities_render_where_they_always_did() -> void:
	var sink := _sink()
	var cases := [
		["res://scenes/Player.tscn", "Sprite", "crow_walk", true, -28.0],
		["res://scenes/Enemy.tscn", "Sprite", "cockroach", true, -28.0],
		["res://scenes/Door.tscn", "Anim", "door", false, -48.0],
		["res://scenes/Coin.tscn", "Anim", "coin", false, 0.0],
	]
	for c in cases:
		var path: String = c[0]
		if not ResourceLoader.exists(path):
			continue
		var inst: Node = load(path).instantiate()
		Engine.get_main_loop().root.add_child(inst)
		var node: Node = inst.get_node_or_null(NodePath(c[1]))
		assert_true(node != null, "%s has a %s node" % [path.get_file(), c[1]])
		if node != null:
			var derived := SpriteSheet.anchor_offset(String(c[2]), sink if bool(c[3]) else 0.0)
			assert_eq(node.offset, derived, "%s offset is derived" % path.get_file())
			assert_eq(derived.y, float(c[4]),
				"%s still renders at the value the .tscn used to hardcode" % path.get_file())
		inst.free()

## A test that only speaks up when it finds a violation is indistinguishable from
## one whose loop has silently stopped looking. This one used to `continue` past an
## unreadable path and assert nothing at all on a clean tree — so renaming these
## five scenes would have disabled it without turning anything red. The runner
## reports a test that asserts nothing, which is how that was noticed.
##
## So it now proves it did the work: every scene opened, and a sprite node was
## actually examined in each.
func test_scenes_carry_no_hardcoded_sprite_offset() -> void:
	const SCENES := ["res://scenes/Player.tscn", "res://scenes/Enemy.tscn",
			"res://scenes/Npc.tscn", "res://scenes/Coin.tscn", "res://scenes/Door.tscn"]
	for path in SCENES:
		var f := FileAccess.open(path, FileAccess.READ)
		assert_true(f != null, "%s is readable" % path.get_file())
		if f == null:
			continue
		var text := f.get_as_text()
		f.close()
		var in_sprite := false
		var sprites_seen := 0
		for line in text.split("\n"):
			if line.begins_with("[node "):
				in_sprite = line.contains("Sprite2D") or line.contains("AnimatedSprite2D")
				if in_sprite:
					sprites_seen += 1
			elif in_sprite and line.begins_with("offset = "):
				assert_true(false, "%s hardcodes a sprite offset: %s" % [path.get_file(), line])
		assert_true(sprites_seen > 0,
			"%s has a sprite node to check; if it does not, this scene no longer belongs in the list"
				% path.get_file())
