extends Control
## LevelSelect — choosing where to go next.
##
## What this replaced: a vertical stack of six identical grey slabs, three of
## them greyed out with "  (Locked)" appended in English. It answered "which
## levels exist" and nothing else.
##
## Now the worlds are cards painted in their own palettes, scrolled sideways.
## Horizontal because that is the axis a thumb sweeps on a tablet held in
## landscape, and because a row of places reads as a journey while a column of
## rows reads as a settings list.
##
## A level is unlocked when it has no unlockRequirement or its required level is
## completed. Selecting one sets the current level and starts the game.

const TITLE_TOP := 18.0
const TITLE_H := 58.0
const CARD_SEPARATION := 20
const ROW_SIDE_PADDING := 28

func _ready() -> void:
	BrandTheme.apply(self)
	add_child(ScreenBackdrop.new())

	var title := Label.new()
	title.text = TextManager.t("level_select.title")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 46)
	title.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	title.add_theme_color_override("font_shadow_color", ThemeManager.get_color_value("ink"))
	title.add_theme_constant_override("shadow_offset_x", 3)
	title.add_theme_constant_override("shadow_offset_y", 3)
	title.anchor_right = 1.0
	title.offset_top = TITLE_TOP
	title.offset_bottom = TITLE_TOP + TITLE_H
	add_child(title)

	# The row scrolls sideways. Six worlds do not fit across 960px and more are
	# coming, so the scroller is what keeps a seventh reachable.
	var scroll := ScrollContainer.new()
	scroll.anchor_right = 1.0
	scroll.anchor_bottom = 1.0
	scroll.offset_top = TITLE_TOP + TITLE_H + 6
	scroll.offset_bottom = -(BrandButton.MIN_HEIGHT + 28.0)  # clear of Back, bottom-left
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	# The row is swiped, not dragged by a bar. A default grey scrollbar across the
	# bottom of a painted screen reads as chrome from a different application.
	scroll.get_h_scroll_bar().modulate.a = 0.0
	add_child(scroll)
	_scroll = scroll
	# Snap to a card once a swipe settles. Free-scrolling leaves a world half
	# off the edge, which on a thumb means every stop needs a correcting nudge.
	scroll.get_h_scroll_bar().value_changed.connect(_on_scrolled)

	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", CARD_SEPARATION)
	row.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	scroll.add_child(row)

	# Breathing room at both ends so the first and last card are not flush
	# against the screen edge when the row is scrolled to a stop.
	row.add_child(_spacer())

	var completed: Array = SaveManager.get_data().get("completedLevels", [])
	var first: WorldCard = null
	for level in LevelManager.get_levels():
		var key := String(level.get("key", ""))
		var unlocked := _is_unlocked(level, completed)
		var card := WorldCard.make(key, level, unlocked, completed.has(key), _play.bind(key))
		row.add_child(card)
		if unlocked and first == null:
			first = card

	row.add_child(_spacer())

	if first != null:
		first.grab_focus.call_deferred()

	# Back sits outside the scroller: it must never scroll out of reach.
	var back := BrandButton.make(TextManager.t("level_select.back"), BrandButton.Role.GHOST,
		func(): SceneRouter.goto("main_menu"))
	# Bottom-left, not top-left: at the top it sat on the title and covered the
	# corner of the first world card.
	# Sized from BrandButton.MIN_HEIGHT rather than a guess: the button enforces
	# the 88px touch floor (Gate B3), so laying it out as 56 tall pushed its
	# bottom edge off the screen.
	back.custom_minimum_size = Vector2(150, BrandButton.MIN_HEIGHT)
	back.anchor_top = 1.0
	back.anchor_bottom = 1.0
	back.offset_left = 20
	back.offset_top = -(BrandButton.MIN_HEIGHT + 18.0)
	back.offset_right = 20 + 150
	back.offset_bottom = -18
	add_child(back)

## Settle onto the nearest card after the scroll stops moving.
##
## Debounced rather than snapping on every scroll event: snapping mid-swipe
## fights the finger. The timer restarts on each movement, so it only fires once
## the swipe is over.
const SNAP_SETTLE_SECONDS := 0.18
const SNAP_SECONDS := 0.22

var _scroll: ScrollContainer
var _snap_timer: SceneTreeTimer

func _on_scrolled(_value: float) -> void:
	_snap_timer = get_tree().create_timer(SNAP_SETTLE_SECONDS)
	var mine := _snap_timer
	await mine.timeout
	if _snap_timer != mine or not is_instance_valid(_scroll):
		return                                   # a newer swipe restarted the wait
	_snap_to_nearest()

func _snap_to_nearest() -> void:
	var stride := WorldCard.SIZE.x + float(CARD_SEPARATION)
	var bar := _scroll.get_h_scroll_bar()
	var target: float = clampf(roundf(_scroll.scroll_horizontal / stride) * stride,
		bar.min_value, maxf(bar.min_value, bar.max_value - bar.page))
	if absf(target - float(_scroll.scroll_horizontal)) < 1.0:
		return
	var tw := create_tween()
	tw.tween_property(_scroll, "scroll_horizontal", int(target), SNAP_SECONDS) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)

func _spacer() -> Control:
	var pad := Control.new()
	pad.custom_minimum_size = Vector2(ROW_SIDE_PADDING, 0)
	pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return pad

func _is_unlocked(level: Dictionary, completed: Array) -> bool:
	var req = level.get("unlockRequirement", null)
	if req == null:
		return true
	return completed.has(String(req.get("level", "")))

func _play(key: String) -> void:
	LevelManager.set_current_level(key)
	SceneRouter.goto("game")
