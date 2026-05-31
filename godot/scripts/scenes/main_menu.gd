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
		_add_button(col, TextManager.t("menu.continue") if TextManager.get_default("menu.continue") != "" else "Continue", _on_play)

func _add_button(parent: Node, text: String, cb: Callable) -> void:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(280, 72)
	b.add_theme_font_size_override("font_size", 32)
	b.pressed.connect(cb)
	parent.add_child(b)
	b.grab_focus()

func _on_play() -> void:
	get_tree().change_scene_to_file("res://scenes/Game.tscn")
