extends Control
## MainMenu — Godot port of MainMenuScene. Title + Play (and Continue if a save
## exists). Keyboard/touch friendly. Login flow is deferred; Play starts the game.

func _ready() -> void:
	var center := CenterContainer.new()
	center.anchor_right = 1.0
	center.anchor_bottom = 1.0
	add_child(center)
	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 24)
	center.add_child(col)

	var title := Label.new()
	title.text = TextManager.t("menu.title")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 96)
	title.add_theme_color_override("font_color", Color.WHITE)
	col.add_child(title)

	_add_button(col, TextManager.t("menu.play"), _on_play)
	if SaveManager.has_save():
		_add_button(col, "Continue", _on_continue)
	if ProfileManager.get_active_user() != null:
		_add_button(col, "Switch Player", _on_switch_user)

func _add_button(parent: Node, text: String, cb: Callable) -> void:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(280, 72)
	b.add_theme_font_size_override("font_size", 32)
	b.pressed.connect(cb)
	UiFx.attach_focus_highlight(b)
	parent.add_child(b)
	if parent.get_child_count() == 2:  # focus the first button (after title)
		b.grab_focus()

func _on_play() -> void:
	get_tree().change_scene_to_file("res://scenes/LevelSelect.tscn")

## Continue resumes the level stored in the save (MainMenuScene.ts passes
## save.currentLevel to GameScene). Falls back to level_01 for unknown keys.
func resolve_continue_key(save: Dictionary) -> String:
	var key := String(save.get("currentLevel", "level_01"))
	return key if LevelManager.has_level(key) else "level_01"

func _on_continue() -> void:
	LevelManager.set_current_level(resolve_continue_key(SaveManager.get_data()))
	get_tree().change_scene_to_file("res://scenes/Game.tscn")

func _on_switch_user() -> void:
	ProfileManager.logout()
	get_tree().change_scene_to_file("res://scenes/Login.tscn")
