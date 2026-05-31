extends TestCase
## Slice 8 (Tier-3 modularity): swapping the active theme/skin at runtime
## restyles via the palette with no code change, and emits theme_changed.

func _reset() -> void:
	_failures.clear()
	_assertions = 0

func _tm() -> Node:
	return Engine.get_main_loop().root.get_node("ThemeManager")

func test_themes_registered() -> void:
	var tm := _tm()
	tm.set_theme("forest")
	assert_eq(tm.get_theme_id(), "forest", "forest active")
	assert_true(tm.get_color("accent") != "", "forest has accent color")

func test_swap_changes_palette_and_emits() -> void:
	var tm := _tm()
	tm.set_theme("forest")
	var forest_accent: Color = tm.get_color_value("accent")
	var fired := [""]
	var cb := func(id): fired[0] = id
	tm.theme_changed.connect(cb)
	tm.set_theme("scifi")
	tm.theme_changed.disconnect(cb)
	assert_eq(tm.get_theme_id(), "scifi", "scifi active after swap")
	assert_eq(fired[0], "scifi", "theme_changed emitted with id")
	var scifi_accent: Color = tm.get_color_value("accent")
	assert_true(forest_accent != scifi_accent, "accent color differs between skins")
	tm.set_theme("forest")  # restore
