extends TestCase
## Swapping the active theme at runtime restyles via the palette with no code
## change, and emits theme_changed.
##
## Swaps between two WORLDS. It used to swap between `forest` and `scifi`, a pair
## kept alive by this test and nothing else; a test that is the only reason its
## own fixture exists is not testing the shipped thing.

func _reset() -> void:
	_failures.clear()
	_assertions = 0

func _tm() -> Node:
	return Engine.get_main_loop().root.get_node("ThemeManager")

const FROM := "emberwood"
const TO := "aurora_spire"

func test_themes_registered() -> void:
	var tm := _tm()
	tm.set_theme(FROM)
	assert_eq(tm.get_theme_id(), FROM, "%s active" % FROM)
	assert_true(tm.get_color("accent") != "", "%s has an accent colour" % FROM)

func test_swap_changes_palette_and_emits() -> void:
	var tm := _tm()
	var before: String = tm.get_theme_id()
	tm.set_theme(FROM)
	var from_accent: Color = tm.get_color_value("accent")
	var fired := [""]
	var cb := func(id): fired[0] = id
	tm.theme_changed.connect(cb)
	tm.set_theme(TO)
	tm.theme_changed.disconnect(cb)
	assert_eq(tm.get_theme_id(), TO, "%s active after swap" % TO)
	assert_eq(fired[0], TO, "theme_changed emitted with id")
	var to_accent: Color = tm.get_color_value("accent")
	assert_true(from_accent != to_accent, "accent colour differs between worlds")
	tm.set_theme(before)  # restore whatever was active
