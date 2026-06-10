extends CanvasLayer
## Pause overlay — Godot port of PauseScene. Runs while the tree is paused
## (process_mode ALWAYS). Resume returns to play; Quit goes to the main menu.

func _ready() -> void:
	layer = 20
	process_mode = Node.PROCESS_MODE_ALWAYS
	var dim := ColorRect.new()
	dim.color = ThemeManager.get_color_value("scrim_soft")
	dim.anchor_right = 1.0
	dim.anchor_bottom = 1.0
	add_child(dim)
	var center := CenterContainer.new()
	center.anchor_right = 1.0
	center.anchor_bottom = 1.0
	dim.add_child(center)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 20)
	center.add_child(col)

	var title := Label.new()
	title.text = TextManager.t("pause.title")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 56)
	col.add_child(title)
	_button(col, TextManager.t("pause.resume"), _resume)
	_theme_btn = _button(col, _theme_label(), _toggle_theme)
	_button(col, TextManager.t("pause.quit"), _quit)

var _theme_btn: Button

func _theme_label() -> String:
	return TextManager.t("pause.theme", [ThemeManager.get_theme_id()])

func _toggle_theme() -> void:
	# Tier-3 demo: hot-swap the skin at runtime; HUD restyles via theme_changed.
	ThemeManager.set_theme("scifi" if ThemeManager.get_theme_id() == "forest" else "forest")
	if is_instance_valid(_theme_btn):
		_theme_btn.text = _theme_label()

func _button(parent: Node, text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(240, 64)
	b.add_theme_font_size_override("font_size", 28)
	b.pressed.connect(cb)
	UiFx.attach_focus_highlight(b)
	parent.add_child(b)
	return b

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		_resume()

func _resume() -> void:
	get_tree().paused = false
	queue_free()

func _quit() -> void:
	get_tree().paused = false
	SceneRouter.goto("main_menu")
