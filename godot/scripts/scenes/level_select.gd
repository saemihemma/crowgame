extends Control
class_name LevelSelect
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

## The Math Practice Arena, which is not a world.
const PRACTICE_ARENA_KEY := "level_99"

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

	## The Math Practice Arena: a flat 200-tile run of nineteen owls and no
	## platforming. It held `order: 1`, which put it in the FIRST card slot and
	## left every other card sitting one position ahead of its own level number --
	## the fourth card was level three, which is what a playtester reported as "i
	## can play like level 4 now but not 3". The order is fixed in the registry;
	## this is the separate question of whether it belongs in a child's grid at
	## all, and by default it does not.
	##
	## It is still reachable: nothing here deletes it, and the flag is in the
	## grown-up panel. If it stays hidden, free practice wants an entry point a
	## parent can find -- that decision is open.
	var completed: Array = SaveManager.get_data().get("completedLevels", [])
	var unlocked_by_key := unlock_map(LevelManager.get_levels(), completed)
	var first: WorldCard = null
	for level in LevelManager.get_levels():
		var key := String(level.get("key", ""))
		if key == PRACTICE_ARENA_KEY and not bool(Config.flag("levels/practice_arena_in_grid", false)):
			continue
		var unlocked := bool(unlocked_by_key.get(key, false))
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

## Which levels a child may open, as {key: bool}.
##
## MONOTONE, and that is the whole fix. This used to ask each level on its own
## whether the one level it names as its requirement is in completedLevels. That
## is a chain, and a chain breaks in the middle: a save holding level_01 and
## level_03 but not level_02 rendered card three as LOCKED -- because its
## requirement, level_02, was missing -- while card four rendered READY, because
## ITS requirement, level_03, was there. A locked world sitting between two open
## ones, which is what a playtester photographed and, in their words, "makes no
## sense".
##
## Worse than the hole: card three was a level the child had FINISHED. WorldCard
## checks `not unlocked` before it checks `completed`, so the card said "Læst" on
## a world they had already cleared.
##
## Gaps like that are not exotic. This save has one because of the ordering bug
## already fixed on this branch -- the practice arena held order 1, so every card
## opened the level BEFORE the one it showed, and a child pressing card four
## played level three without ever playing level two. A cloud save merged across
## two devices, or a registry that ever gains or loses a level, would do the same
## thing.
##
## So progress is read as a HIGH-WATER MARK rather than a chain: everything up to
## and including one past the furthest level ever finished is open. A completed
## level is always open too, whatever else is true -- a card must never call a
## world locked when the child has already beaten it. Self-healing, so the save
## in the screenshot fixes itself on the next launch and card two becomes
## playable instead of card three becoming a lie.
##
## The practice arena is deliberately outside the water mark: it has no
## requirement so it is always open, and drilling sums in a flat room must not
## unlock the last platforming level.
static func unlock_map(levels: Array, completed: Array) -> Dictionary:
	var graded: Array = []
	for level in levels:
		if String((level as Dictionary).get("key", "")) != PRACTICE_ARENA_KEY:
			graded.append(level)

	var furthest := -1
	for i in graded.size():
		if completed.has(String((graded[i] as Dictionary).get("key", ""))):
			furthest = i

	var out := {}
	for level in levels:
		out[String((level as Dictionary).get("key", ""))] = true
	for i in graded.size():
		var key := String((graded[i] as Dictionary).get("key", ""))
		var required = (graded[i] as Dictionary).get("unlockRequirement", null)
		out[key] = required == null or completed.has(key) or i <= furthest + 1
	return out

func _play(key: String) -> void:
	LevelManager.set_current_level(key)
	SceneRouter.goto("game")
