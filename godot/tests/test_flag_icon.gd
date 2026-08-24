extends TestCase
## The language selector's flags are DRAWN, not emoji, and these pin the reasons.
##
## A flag emoji would be a pair of regional-indicator code points far outside
## Latin-1. This export bundles one font with no emoji coverage, so it would
## render as two missing-glyph boxes -- the exact tofu this localisation work
## started from. The drawn version has no font dependency at all.

## res:// cannot escape the project root, so resolve the sibling src/ tree
## through the real filesystem path instead.
static func _web_source_path() -> String:
	return ProjectSettings.globalize_path("res://").path_join("../src/ui/components/FlagIcon.ts")


func test_flag_icon_draws_without_a_font() -> void:
	for code in ["en", "is"]:
		var icon := FlagIcon.make(code, Vector2(26, 18))
		Engine.get_main_loop().root.add_child(icon)
		await Engine.get_main_loop().process_frame
		assert_true(icon.is_inside_tree(), "'%s' flag mounts" % code)
		assert_true(icon.size.x > 0.0 and icon.size.y > 0.0,
			"'%s' flag has a drawable size (got %s)" % [code, icon.size])
		icon.queue_free()


## An unknown locale must still draw something rather than nothing or an error,
## because the selector builds one icon per available locale and a third language
## is expected to be cheap to add.
func test_unknown_locale_falls_back_to_a_drawn_flag() -> void:
	var icon := FlagIcon.make("zz", Vector2(26, 18))
	Engine.get_main_loop().root.add_child(icon)
	await Engine.get_main_loop().process_frame
	assert_true(icon.is_inside_tree(), "an unknown locale still mounts")
	icon.queue_free()


## The proportions are shared with src/ui/components/FlagIcon.ts. If one side is
## retuned and the other is not, the two ports draw visibly different flags --
## and nothing else would catch that, because neither runtime can read the
## other's canvas.
func test_proportions_match_the_web_port() -> void:
	var path := _web_source_path()
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		# An exported build has no src/ tree beside it. Only skip there; from the
		# repo the file must be readable, or this test would quietly assert
		# nothing at all.
		assert_true(OS.has_feature("template"),
			"FlagIcon.ts is readable at %s (a silent skip here would mean this "
			% path + "test checks nothing)")
		return
	var web := f.get_as_text()
	f.close()

	var shared := {
		"CROSS_WHITE_T": FlagIcon.CROSS_WHITE_T,
		"CROSS_RED_T": FlagIcon.CROSS_RED_T,
		"CROSS_VERTICAL_CX": FlagIcon.CROSS_VERTICAL_CX,
		"US_CANTON_W": FlagIcon.US_CANTON_W,
	}
	for name: String in shared:
		var expected: float = shared[name]
		var pattern := "%s = %s" % [name, expected]
		assert_true(web.contains(pattern),
			"FlagIcon.ts declares %s as %s (looked for '%s')" % [name, expected, pattern])

	for name: String in {"US_STRIPES": FlagIcon.US_STRIPES, "US_CANTON_STRIPES": FlagIcon.US_CANTON_STRIPES}:
		var expected: int = {"US_STRIPES": FlagIcon.US_STRIPES, "US_CANTON_STRIPES": FlagIcon.US_CANTON_STRIPES}[name]
		assert_true(web.contains("%s = %d" % [name, expected]),
			"FlagIcon.ts declares %s as %d" % [name, expected])
