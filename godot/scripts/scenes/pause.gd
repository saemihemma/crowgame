extends CanvasLayer
## Pause overlay. Runs while the tree is paused (process_mode ALWAYS).
##
## What this replaced: three translucent grey slabs floating over the running
## level with the world showing through them, and - worse - a "Theme: emberwood"
## button that let a child swap their world's entire palette for an unrelated
## one. brand/BRAND_SYSTEM.md §14 already flagged that button as promising a
## feature that does not exist; a world's look is decided by the level, not by a
## menu, so it is gone rather than reimplemented.
##
## Two actions, on a card. Resume is the primary one because it is what almost
## every pause ends in.

const CARD_PAD := 30
const CARD_CORNER := 26

func _ready() -> void:
	layer = 20
	process_mode = Node.PROCESS_MODE_ALWAYS

	var dim := ColorRect.new()
	BrandTheme.apply(dim)
	dim.color = ThemeManager.get_color_value("scrim")
	dim.anchor_right = 1.0
	dim.anchor_bottom = 1.0
	add_child(dim)

	var center := CenterContainer.new()
	center.anchor_right = 1.0
	center.anchor_bottom = 1.0
	dim.add_child(center)

	# A card, so the menu reads as something laid over the game rather than as
	# buttons dropped into it.
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", _card_face())
	center.add_child(card)

	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 16)
	card.add_child(col)

	var title := Label.new()
	title.text = TextManager.t("pause.title")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 48)
	title.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	col.add_child(title)

	var resume := _button(col, TextManager.t("pause.resume"), BrandButton.Role.PRIMARY, _resume)
	_button(col, TextManager.t("pause.quit"), BrandButton.Role.GHOST, _quit)
	resume.grab_focus.call_deferred()

func _card_face() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(ThemeManager.get_color_value("ink"), 0.92)
	box.set_corner_radius_all(CARD_CORNER)
	box.set_border_width_all(3)
	box.border_color = Color(ThemeManager.get_color_value("paper"), 0.45)
	box.set_content_margin_all(CARD_PAD)
	return box

func _button(parent: Node, text: String, role: int, cb: Callable) -> BrandButton:
	var b := BrandButton.make(text, role, cb)
	b.custom_minimum_size.x = 300
	b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
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
