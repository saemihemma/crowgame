extends TestCase
## The language selector's flags are DRAWN, not emoji, and these pin the reasons.
##
## A flag emoji would be a pair of regional-indicator code points far outside
## Latin-1. This export bundles one font with no emoji coverage, so it would
## render as two missing-glyph boxes -- the exact tofu this localisation work
## started from. The drawn version has no font dependency at all.

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


## Flag geometry is pinned by value.
##
## This used to read src/ui/components/FlagIcon.ts and assert the two ports
## declared the same proportions, because a retune on one side and not the other
## drew visibly different flags and nothing else could catch it. That Phaser tree
## is deleted: there is no second implementation left to drift from, so the
## cross-tree read is gone.
##
## The constants are still pinned here, by value, because the original worry
## underneath that test was never really "do two files agree" — it was "can these
## numbers change without anyone noticing". They can, and this is what notices.
## Nudging one is fine; doing it accidentally is not.
func test_proportions_are_pinned() -> void:
	assert_eq(FlagIcon.CROSS_WHITE_T, 0.24, "Nordic cross white arm thickness")
	assert_eq(FlagIcon.CROSS_RED_T, 0.12, "Nordic cross red arm thickness")
	assert_eq(FlagIcon.CROSS_VERTICAL_CX, 0.36, "Nordic cross vertical centre")
	assert_eq(FlagIcon.US_CANTON_W, 0.42, "US canton width")
	assert_eq(FlagIcon.US_STRIPES, 7, "US stripe count")
	assert_eq(FlagIcon.US_CANTON_STRIPES, 4, "US canton stripe count")
