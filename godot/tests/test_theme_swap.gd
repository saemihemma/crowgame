extends TestCase
## Swapping the active theme at runtime restyles via the palette with no code
## change, and emits theme_changed.
##
## Swaps between two WORLD themes rather than the legacy forest/scifi pair. The
## mechanism under test is ThemeManager, not any particular skin, and using the
## legacy ids here was the other half of what kept two unselected themes in the
## tree (see roadmap.md).

func _tm() -> Node:
	return Engine.get_main_loop().root.get_node("ThemeManager")

func test_themes_registered() -> void:
	var tm := _tm()
	tm.set_theme("emberwood")
	assert_eq(tm.get_theme_id(), "emberwood", "emberwood active")
	assert_true(tm.get_color("accent") != "", "emberwood has accent color")

func test_swap_changes_palette_and_emits() -> void:
	var tm := _tm()
	tm.set_theme("emberwood")
	var ember_accent: Color = tm.get_color_value("accent")
	var fired := [""]
	var cb := func(id): fired[0] = id
	tm.theme_changed.connect(cb)
	tm.set_theme("prism_hollow")
	tm.theme_changed.disconnect(cb)
	assert_eq(tm.get_theme_id(), "prism_hollow", "prism_hollow active after swap")
	assert_eq(fired[0], "prism_hollow", "theme_changed emitted with id")
	var prism_accent: Color = tm.get_color_value("accent")
	assert_true(ember_accent != prism_accent, "accent color differs between worlds")
	tm.set_theme("emberwood")  # restore the default
