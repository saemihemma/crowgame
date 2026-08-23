extends Control
## LevelSelect — Godot port of LevelSelectScene. Lists registry levels; a level
## is unlocked when it has no unlockRequirement or its required level is
## completed. Selecting one sets the current level and starts the game.

const TITLE_TOP := 16.0
const TITLE_H := 64.0
const LIST_BOTTOM_MARGIN := 16.0

var _scroll: ScrollContainer


func _ready() -> void:
	# Title outside the scroller so it stays put while the list moves.
	var title := Label.new()
	title.text = TextManager.t("level_select.title")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 56)
	title.anchor_right = 1.0
	title.offset_top = TITLE_TOP
	title.offset_bottom = TITLE_TOP + TITLE_H
	add_child(title)

	# The list scrolls. Laid out flat it outgrows the 540-tall viewport: six
	# levels already need ~526px including the title and back button, so a
	# seventh would be unreachable -- the exact defect the web build shipped.
	_scroll = ScrollContainer.new()
	_scroll.anchor_right = 1.0
	_scroll.anchor_bottom = 1.0
	_scroll.offset_top = TITLE_TOP + TITLE_H + 8
	_scroll.offset_bottom = -LIST_BOTTOM_MARGIN
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(_scroll)

	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_BEGIN
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_theme_constant_override("separation", 12)
	_scroll.add_child(col)

	var completed: Array = SaveManager.get_data().get("completedLevels", [])
	for level in LevelManager.get_levels():
		var key := String(level.get("key", ""))
		var unlocked := _is_unlocked(level, completed)
		var b := Button.new()
		b.text = _level_label(level, key, unlocked)
		b.disabled = not unlocked
		b.custom_minimum_size = Vector2(360, 56)
		b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		b.add_theme_font_size_override("font_size", 26)
		b.pressed.connect(func(): _play(key))
		UiFx.attach_focus_highlight(b)
		col.add_child(b)
		if col.get_child_count() == 2:  # first level button (after title)
			b.grab_focus()

	# Back sits outside the scroller: it must never scroll out of reach.
	var back := Button.new()
	back.text = TextManager.t("level_select.back")
	back.custom_minimum_size = Vector2(220, 44)
	back.anchor_top = 0.0
	back.offset_left = 16
	back.offset_top = TITLE_TOP + 8
	back.offset_right = 16 + 220
	back.offset_bottom = TITLE_TOP + 8 + 44
	back.pressed.connect(func(): SceneRouter.goto("main_menu"))
	UiFx.attach_focus_highlight(back)
	add_child(back)

## Level names are translated when a `level.<key>.name` key exists, and fall
## back to the registry name so a newly authored level still shows something.
## The locked suffix used to be the literal English "  (locked)".
func _level_label(level: Dictionary, key: String, unlocked: bool) -> String:
	var name_key := "level.%s.name" % key
	var display := TextManager.t(name_key) if TextManager.has(name_key) else String(level.get("name", key))
	if unlocked:
		return display
	return "%s  (%s)" % [display, TextManager.t("level_select.locked")]

func _is_unlocked(level: Dictionary, completed: Array) -> bool:
	var req = level.get("unlockRequirement", null)
	if req == null:
		return true
	return completed.has(String(req.get("level", "")))

func _play(key: String) -> void:
	LevelManager.set_current_level(key)
	SceneRouter.goto("game")
