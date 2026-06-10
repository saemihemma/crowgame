extends CanvasLayer
## TouchControls — Godot port of the virtual gamepad. D-pad (left/right) bottom
## -left, Jump + Peck bottom-right. Each button is a TouchScreenButton bound to
## an InputMap action, so touch drives the exact same actions player.gd reads
## (no separate input path). Auto-shows on touch devices; harmless on desktop.

# Sizes from data/tuning/ui_tuning.json (Config.ui("touch/...")).
@onready var BTN: int = int(Config.ui("touch/button_size", 88))
@onready var GAP: int = int(Config.ui("touch/gap", 12))
@onready var PAD: int = int(Config.ui("touch/pad", 16))

func _ready() -> void:
	layer = 8
	var vw := float(ProjectSettings.get_setting("display/window/size/viewport_width"))
	var vh := float(ProjectSettings.get_setting("display/window/size/viewport_height"))
	var dpad_y := vh - PAD - BTN
	_add_button("move_left", "<", Vector2(PAD, dpad_y))
	_add_button("move_right", ">", Vector2(PAD + BTN + GAP, dpad_y))
	_add_button("jump", TextManager.t("touch.jump"), Vector2(vw - PAD - BTN, dpad_y))
	_add_button("interact", "E", Vector2(vw - PAD - BTN, dpad_y - BTN - GAP))
	_add_button("shoot", TextManager.t("touch.peck"), Vector2(vw - PAD - BTN * 2 - GAP, dpad_y))
	# Hide on non-touch desktop to avoid clutter (keyboard still works).
	if not (DisplayServer.is_touchscreen_available() or OS.has_feature("web") or OS.has_feature("mobile")):
		visible = false

func _add_button(action: String, label: String, pos: Vector2) -> void:
	var b := TouchScreenButton.new()
	b.action = action
	b.position = pos
	# Visual: a semi-transparent rounded panel + label, sized BTN x BTN.
	var panel := ColorRect.new()
	panel.color = ThemeManager.get_color_value("touch_panel")
	panel.size = Vector2(BTN, BTN)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(panel)
	var lbl := Label.new()
	lbl.text = label
	lbl.size = Vector2(BTN, BTN)
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	lbl.add_theme_color_override("font_color", ThemeManager.get_color_value("touch_label"))
	lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(lbl)
	# Square press shape covering the panel.
	var shape := RectangleShape2D.new()
	shape.size = Vector2(BTN, BTN)
	b.shape = shape
	b.shape_centered = false
	add_child(b)
