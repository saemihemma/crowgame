extends Control
## LevelSelect — Godot port of LevelSelectScene. Lists registry levels; a level
## is unlocked when it has no unlockRequirement or its required level is
## completed. Selecting one sets the current level and starts the game.

func _ready() -> void:
	var center := CenterContainer.new()
	center.anchor_right = 1.0
	center.anchor_bottom = 1.0
	add_child(center)
	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 12)
	center.add_child(col)

	var title := Label.new()
	title.text = "Pick a Level"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 56)
	col.add_child(title)

	var completed: Array = SaveManager.get_data().get("completedLevels", [])
	for level in LevelManager.get_levels():
		var key := String(level.get("key", ""))
		var unlocked := _is_unlocked(level, completed)
		var b := Button.new()
		b.text = String(level.get("name", key)) + ("" if unlocked else "  (locked)")
		b.disabled = not unlocked
		b.custom_minimum_size = Vector2(360, 56)
		b.add_theme_font_size_override("font_size", 26)
		b.pressed.connect(func(): _play(key))
		UiFx.attach_focus_highlight(b)
		col.add_child(b)
		if col.get_child_count() == 2:  # first level button (after title)
			b.grab_focus()

	var back := Button.new()
	back.text = "Back"
	back.custom_minimum_size = Vector2(360, 48)
	back.pressed.connect(func(): get_tree().change_scene_to_file("res://scenes/MainMenu.tscn"))
	UiFx.attach_focus_highlight(back)
	col.add_child(back)

func _is_unlocked(level: Dictionary, completed: Array) -> bool:
	var req = level.get("unlockRequirement", null)
	if req == null:
		return true
	return completed.has(String(req.get("level", "")))

func _play(key: String) -> void:
	LevelManager.set_current_level(key)
	get_tree().change_scene_to_file("res://scenes/Game.tscn")
