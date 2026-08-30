extends Control
## How much of the game is finished, and where the rest of it is.
##
## The headline is one number, because that is the question a child asks. Under it
## is the answer to the question they ask next -- WHICH bit is missing -- as one
## row per level: cleared, its big coins, its owls, drawn as the same pips they
## have already met in the HUD and on the locked door.
##
## Every row is legible without reading. A child who cannot yet read "Forest
## Clearing" can still see that its third coin socket is empty, and that is the
## whole purpose of the screen: to send them somewhere specific.
##
## A SCROLLER, not a fitted card. The list grows with the level registry -- the
## repo's rule (godot/tests/test_scrolling_lists.gd) is that a list which grows
## with content scrolls, and only a fixed, known column gets scaled to fit.
##
## The arithmetic is not here. Progress.of_save owns it, and returns the rows and
## the headline together precisely so this screen cannot compute a total that
## disagrees with the rows under it.

const TITLE_TOP := 16.0
const TITLE_H := 46.0
const HEADLINE_H := 74.0
const ROW_HEIGHT := 62.0
const ROW_SEPARATION := 8
const SIDE_PADDING := 26.0
const NAME_WIDTH := 250.0
## Wide, because two pip groups sit in one row. The first capture of this screen
## put them 14px apart with nothing marking which was which, and a row of three
## coins beside two owls read as one row of five - with the pale FILLED owls
## looking like unlit coins. The gap and the icons are what separate them.
const GROUP_SEPARATION := 22
const ROW_ICON := 26.0

func _ready() -> void:
	BrandTheme.apply(self)
	add_child(ScreenBackdrop.new())

	var report: Dictionary = Progress.of_save(SaveManager.get_data())

	var title := Label.new()
	# WHOSE JOURNEY. The screen is called "Mitt ferðalag" and never said whose it
	# was -- which matters most on exactly the device this game is built for: a
	# shared family tablet with two or three children's profiles on it. A child
	# arriving here after somebody else played had no way to tell whether the 38%
	# on the screen was theirs.
	#
	# The name goes in the title rather than in a row of its own, so it costs no
	# vertical space on a screen that is already a scroller.
	var who = ProfileManager.get_active_user()
	title.text = TextManager.t("progress.title") if who == null \
		else TextManager.t("progress.title_named", [String(who)])
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 40)
	title.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	title.add_theme_color_override("font_shadow_color", ThemeManager.get_color_value("ink"))
	title.add_theme_constant_override("shadow_offset_x", 3)
	title.add_theme_constant_override("shadow_offset_y", 3)
	title.anchor_right = 1.0
	title.offset_top = TITLE_TOP
	title.offset_bottom = TITLE_TOP + TITLE_H
	add_child(title)

	# The number, alone and enormous. Everything below it is the explanation.
	var headline := Label.new()
	headline.text = "%d%%" % Progress.percent(float(report.get("overall", 0.0)))
	headline.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	headline.add_theme_font_size_override("font_size", 64)
	headline.add_theme_color_override("font_color", ThemeManager.get_color_value("coin"))
	headline.add_theme_color_override("font_shadow_color", ThemeManager.get_color_value("ink"))
	headline.add_theme_constant_override("shadow_offset_x", 3)
	headline.add_theme_constant_override("shadow_offset_y", 3)
	headline.anchor_right = 1.0
	headline.offset_top = TITLE_TOP + TITLE_H
	headline.offset_bottom = TITLE_TOP + TITLE_H + HEADLINE_H
	add_child(headline)

	var scroll := ScrollContainer.new()
	scroll.anchor_right = 1.0
	scroll.anchor_bottom = 1.0
	scroll.offset_left = SIDE_PADDING
	scroll.offset_right = -SIDE_PADDING
	scroll.offset_top = TITLE_TOP + TITLE_H + HEADLINE_H + 4.0
	scroll.offset_bottom = -(BrandButton.MIN_HEIGHT + 28.0)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(scroll)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", ROW_SEPARATION)
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(column)
	for row in report.get("levels", []):
		column.add_child(_row(row as Dictionary))

	# Back sits outside the scroller, so it can never scroll out of reach.
	var back := BrandButton.make(TextManager.t("progress.back"), BrandButton.Role.GHOST,
		func() -> void: SceneRouter.goto("main_menu"))
	back.custom_minimum_size = Vector2(150, BrandButton.MIN_HEIGHT)
	back.anchor_top = 1.0
	back.anchor_bottom = 1.0
	back.offset_left = 20
	back.offset_top = -(BrandButton.MIN_HEIGHT + 18.0)
	back.offset_right = 20 + 150
	back.offset_bottom = -18
	add_child(back)
	back.grab_focus.call_deferred()


## One level: its name, then its three facts as pips.
##
## The pip rows are the same component the HUD and the locked-door card use, so a
## child reads this screen with vocabulary they already have rather than learning
## a third notation for the same idea.
func _row(data: Dictionary) -> Control:
	var key := String(data.get("key", ""))
	var panel := PanelContainer.new()
	panel.custom_minimum_size.y = ROW_HEIGHT
	panel.add_theme_stylebox_override("panel", _row_face(bool(data.get("cleared", false))))

	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", GROUP_SEPARATION)
	panel.add_child(line)

	var name_key := "level.%s.name" % key
	var name_label := Label.new()
	name_label.text = TextManager.t(name_key) if TextManager.has(name_key) else key
	name_label.add_theme_font_size_override("font_size", 22)
	name_label.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	name_label.custom_minimum_size.x = NAME_WIDTH
	name_label.clip_text = true
	line.add_child(name_label)

	var coins_total := int(data.get("coinsTotal", 0))
	if coins_total > 0:
		_add_group(line, "big_coin", "coin",
			PipRow.make(coins_total, int(data.get("coins", 0)), "coin", "coin"))
		# THE TICK: every big coin in this level, found in one visit.
		#
		# Beside the coins rather than at the end of the row, because it is a
		# statement ABOUT the coins and nothing else -- and only where it is true,
		# so it is a thing to go and get rather than a column of empty boxes.
		#
		# It cannot be drawn from the pips, which is the whole reason the save
		# carries the fact separately: three filled pips also describes a child who
		# found one coin on each of three runs, and that child has never cleared
		# this level in one go.
		if bool(data.get("perfect", false)):
			line.add_child(_perfect_tick())

	var owls_total := int(data.get("owlsTotal", 0))
	if owls_total > 0:
		_add_group(line, "hud_owl_icon", "owl",
			PipRow.make(owls_total, int(data.get("owls", 0)), "owl", "owl"))

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	line.add_child(spacer)

	# The level's own share, so a row that is nearly done looks nearly done even
	# when its pips are two different lengths.
	var share := Label.new()
	share.text = "%d%%" % Progress.percent(float(data.get("fraction", 0.0)))
	share.add_theme_font_size_override("font_size", 22)
	share.add_theme_color_override("font_color", ThemeManager.get_color_value("coin"))
	share.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	share.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	share.custom_minimum_size.x = 62.0
	line.add_child(share)
	return panel


## The all-in-one-go badge, sized to the row's own icons so it reads as part of
## the coin group rather than as a control.
const TICK_SIZE := 30.0

func _perfect_tick() -> Control:
	var tick := PerfectTick.new()
	tick.custom_minimum_size = Vector2(TICK_SIZE, TICK_SIZE)
	tick.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	tick.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tick.tooltip_text = TextManager.t("progress.perfect")
	return tick


## One icon, then its pips. The icon is what makes the row readable by a child
## who cannot read the level's name: without it, three coins beside two owls is a
## row of five circles in two shades, and a FILLED owl (pale owl-gold) is easily
## mistaken for an unlit coin.
func _add_group(line: HBoxContainer, sprite_key: String, fallback_key: String, pips: PipRow) -> void:
	var icon := _icon(sprite_key, fallback_key)
	if icon != null:
		line.add_child(icon)
	pips.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	line.add_child(pips)


## The first frame of a world sprite, at HUD size. Falls back the way the owl
## ring does, so a missing dedicated icon degrades to the real thing rather than
## to nothing.
func _icon(sprite_key: String, fallback_key: String) -> TextureRect:
	var key := sprite_key if SpriteSheet.has_art(sprite_key) else fallback_key
	if not SpriteSheet.has_art(key):
		return null
	var frame := SpriteSheet.frame_size(key)
	var atlas := AtlasTexture.new()
	atlas.atlas = SpriteSheet.texture(key)
	atlas.region = Rect2(0, 0, frame.x, frame.y)
	var rect := TextureRect.new()
	rect.texture = atlas
	rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	rect.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	rect.custom_minimum_size = Vector2(ROW_ICON, ROW_ICON)
	rect.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return rect


## A cleared level's row carries a warmer edge. Not a tick: the row already says
## everything a tick would, and a tick beside two part-filled pip rows reads as a
## contradiction rather than as a third fact.
func _row_face(cleared: bool) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(ThemeManager.get_color_value("ink"), 0.86)
	box.set_corner_radius_all(16)
	box.set_border_width_all(2)
	box.border_color = Color(
		ThemeManager.get_color_value("coin") if cleared else ThemeManager.get_color_value("paper"),
		0.55 if cleared else 0.24)
	box.content_margin_left = 16.0
	box.content_margin_right = 16.0
	box.content_margin_top = 8.0
	box.content_margin_bottom = 8.0
	return box
