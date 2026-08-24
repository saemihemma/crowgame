extends CanvasLayer
## TouchControls — Godot port of the virtual gamepad. D-pad (left/right) bottom
## -left, Jump + Peck bottom-right. Each button is a TouchScreenButton bound to
## an InputMap action, so touch drives the exact same actions player.gd reads
## (no separate input path). Auto-shows on touch devices; harmless on desktop.

# Sizes from data/tuning/ui_tuning.json (Config.ui("touch/...")).
@onready var BTN: int = int(Config.ui("touch/button_size", 88))
@onready var GAP: int = int(Config.ui("touch/gap", 12))
@onready var PAD: int = int(Config.ui("touch/pad", 16))

## action -> its Label, so a locale change can retitle the buttons without
## rebuilding them. Rebuilding would mean destroying live TouchScreenButtons,
## which drops a press the player is holding at that moment; the web port gets
## away with a full rebuild because its buttons are not the input path.
var _labels: Dictionary = {}

func _ready() -> void:
	layer = 8
	var vw := float(ProjectSettings.get_setting("display/window/size/viewport_width"))
	var vh := float(ProjectSettings.get_setting("display/window/size/viewport_height"))
	var dpad_y := vh - PAD - BTN
	_add_button("move_left", "<", Vector2(PAD, dpad_y))
	_add_button("move_right", ">", Vector2(PAD + BTN + GAP, dpad_y))
	_add_button("jump", TextManager.t("touch.jump"), Vector2(vw - PAD - BTN, dpad_y))
	# The shoot button used to be labelled touch.peck and interact was labelled
	# the literal "E" -- a keyboard key printed on a touchscreen. Aligned with
	# TouchControls.ts: shoot reads ZAP/SKOT, interact reads PECK/GOGGA.
	_add_button("interact", TextManager.t("touch.peck"), Vector2(vw - PAD - BTN, dpad_y - BTN - GAP))
	_add_button("shoot", TextManager.t("touch.zap"), Vector2(vw - PAD - BTN * 2 - GAP, dpad_y))
	# Hide on non-touch desktop to avoid clutter (keyboard still works).
	if not (DisplayServer.is_touchscreen_available() or OS.has_feature("web") or OS.has_feature("mobile")):
		visible = false
	# JUMP/STÖKK, PECK/GOGGA and ZAP/SKOT differ between locales, so without
	# this the d-pad keeps the old language until the level reloads.
	TextManager.locale_changed.connect(func(_code: String) -> void: _refresh_labels())

## The three localised button labels. The arrows are notation, not words.
func _refresh_labels() -> void:
	var keys := {"jump": "touch.jump", "interact": "touch.peck", "shoot": "touch.zap"}
	for action: String in keys:
		var lbl: Variant = _labels.get(action, null)
		if lbl is Label:
			(lbl as Label).text = TextManager.t(String(keys[action]))


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
	_labels[action] = lbl
	# Square press shape covering the panel.
	var shape := RectangleShape2D.new()
	shape.size = Vector2(BTN, BTN)
	b.shape = shape
	b.shape_centered = false
	add_child(b)
