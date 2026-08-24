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
	_title = title
	_resume_btn = _button(col, TextManager.t("pause.resume"), _resume)
	_sound_btn = _button(col, _sound_label(), _toggle_sound)
	_language_btn = _button(col, TextManager.endonym(TextManager.get_locale()), _cycle_locale)
	_add_flag(_language_btn)
	_quit_btn = _button(col, TextManager.t("pause.quit"), _quit)

var _title: Label
var _resume_btn: Button
var _sound_btn: Button
var _language_btn: Button
var _quit_btn: Button
var _language_flag: FlagIcon

const FLAG_BOX := Vector2(26.0, 18.0)


## The language row is a flag plus the endonym, not a worded label.
##
## "Tungumál: Íslenska" does not fit a 240px button at 28px, and the flag carries
## the meaning anyway -- it is the same flag-plus-endonym pairing the player
## already met on the login screen and the main menu. The endonym is never
## translated, so someone lost in the wrong language can still get out.
func _add_flag(button: Button) -> void:
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	_language_flag = FlagIcon.make(TextManager.get_locale(), FLAG_BOX)
	_language_flag.position = Vector2(16.0, (64.0 - FLAG_BOX.y) * 0.5)
	button.add_child(_language_flag)
	var box := StyleBoxEmpty.new()
	box.content_margin_left = 16.0 + FLAG_BOX.x + 10.0
	for state in ["normal", "hover", "pressed", "focus"]:
		var existing: StyleBox = button.get_theme_stylebox(state)
		if existing is StyleBoxFlat:
			var flat := (existing as StyleBoxFlat).duplicate() as StyleBoxFlat
			flat.content_margin_left = box.content_margin_left
			button.add_theme_stylebox_override(state, flat)


## Switch language without restarting anything.
##
## Everything behind this panel re-renders itself -- the HUD and the touch
## controls both connect TextManager.locale_changed, and an open math overlay
## retitles from its current problem. The panel's own rows are the one thing that
## has to be repainted here, because this is the surface doing the switching.
## Mirrors PauseScene.cycleLocale() in the web build.
func _cycle_locale() -> void:
	var codes: Array = TextManager.available_locales()
	if codes.size() < 2:
		return
	var here := codes.find(TextManager.get_locale())
	var next := String(codes[(here + 1) % codes.size()])
	TextManager.set_locale(next)

	if is_instance_valid(_title):
		_title.text = TextManager.t("pause.title")
	if is_instance_valid(_resume_btn):
		_resume_btn.text = TextManager.t("pause.resume")
	if is_instance_valid(_quit_btn):
		_quit_btn.text = TextManager.t("pause.quit")
	if is_instance_valid(_sound_btn):
		_sound_btn.text = _sound_label()
	if is_instance_valid(_language_btn):
		_language_btn.text = TextManager.endonym(next)
	if is_instance_valid(_language_flag):
		_language_flag.locale = next
		_language_flag.queue_redraw()

## "Sound: On" / "Hljóð: Slökkt".
##
## This row replaced a theme switcher. A theme is not a setting -- it is a
## property of a place, and ThemeManager's own docstring says so ("Each
## world/level can specify a theme"). Nothing ever chose one: Boot set `forest`
## and the only other caller was this toggle, which made it a control standing in
## for an unbuilt feature. Sound is a setting a parent in a waiting room actually
## reaches for. Mirrors PauseScene.soundLabel() in the web build.
func _sound_label() -> String:
	var key := "sound.off" if AudioManager.is_muted() else "sound.on"
	return TextManager.t("pause.sound", [TextManager.t(key)])


func _toggle_sound() -> void:
	var now_muted := not AudioManager.is_muted()
	# Play the click BEFORE muting, so turning sound off still acknowledges the
	# tap; turning it back on is acknowledged by the click after.
	if now_muted:
		AudioManager.play_sfx("ui_click")
	AudioManager.set_muted(now_muted)
	if not now_muted:
		AudioManager.play_sfx("ui_click")
	if is_instance_valid(_sound_btn):
		_sound_btn.text = _sound_label()

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
