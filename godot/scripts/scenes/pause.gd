extends CanvasLayer
## Pause overlay. Runs while the tree is paused (process_mode ALWAYS).
##
## Four rows: resume, sound, language, quit. Resume is the primary action
## because it is what almost every pause ends in.
##
## The rows themselves and everything they do come from main - a theme is not a
## setting, sound is, and the language row is a flag plus an endonym. What
## changed here is only how they look: they used to be translucent grey slabs
## floating over the running level with the world showing through them, which
## read as buttons dropped into the game rather than a menu laid over it.

func _ready() -> void:
	layer = 20
	process_mode = Node.PROCESS_MODE_ALWAYS
	var dim := ColorRect.new()
	BrandTheme.apply(dim)
	dim.color = ThemeManager.get_color_value("scrim")
	dim.anchor_right = 1.0
	dim.anchor_bottom = 1.0
	add_child(dim)
	# A card, so the menu reads as something laid over the game rather than as
	# buttons dropped into it. Five Gate-B3 rows under a 44px title is 596 tall,
	# and a 16:9 display gives the viewport exactly 540 - so the card is fitted
	# rather than centred, or Quit falls off the bottom.
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", _card_face())
	dim.add_child(FitBox.around(card))

	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 12)
	card.add_child(col)

	var title := Label.new()
	title.text = TextManager.t("pause.title")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 44)
	title.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	col.add_child(title)
	_title = title
	_resume_btn = _button(col, TextManager.t("pause.resume"), _resume, BrandButton.Role.PRIMARY)
	_sound_btn = _button(col, _sound_label(), _toggle_sound)
	# Both rows own their own sound, for the same reason: the row IS the
	# demonstration, and BrandButton's generic tick on top of it reads as a
	# glitch rather than as "this is what that setting sounds like now".
	_sound_btn.clicks = false
	_volume_btn = _button(col, _volume_label(), _cycle_volume)
	_volume_btn.clicks = false
	_language_btn = _button(col, TextManager.endonym(TextManager.get_locale()), _cycle_locale)
	_add_flag(_language_btn)
	_quit_btn = _button(col, TextManager.t("pause.quit"), _quit, BrandButton.Role.GHOST)
	_resume_btn.grab_focus.call_deferred()

var _title: Label
var _resume_btn: Button
var _sound_btn: Button
var _volume_btn: Button
var _language_btn: Button
var _quit_btn: Button
var _language_flag: FlagIcon

const FLAG_BOX := Vector2(26.0, 18.0)
const CARD_PAD := 26
const CARD_CORNER := 26


## The language row is a flag plus the endonym, not a worded label.
##
## "Tungumál: Íslenska" does not fit a 240px button at 28px, and the flag carries
## the meaning anyway -- it is the same flag-plus-endonym pairing the player
## already met on the login screen and the main menu. The endonym is never
## translated, so someone lost in the wrong language can still get out.
func _add_flag(button: Button) -> void:
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	_language_flag = FlagIcon.make(TextManager.get_locale(), FLAG_BOX)
	# Centred against BrandButton.MIN_HEIGHT, not the old fixed 64: the button
	# grew to clear the 88px touch floor and a flag pinned to 64 sat high in it.
	_language_flag.position = Vector2(16.0, (BrandButton.MIN_HEIGHT - FLAG_BOX.y) * 0.5)
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
	if is_instance_valid(_volume_btn):
		_volume_btn.text = _volume_label()
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


## Volume in four steps rather than a slider.
##
## A slider grabber small enough to be precise is too small to hit under Gate B3,
## and this row has to work for the same thumb that plays the game. Four steps
## cycle on tap, exactly like the sound row above it - one idiom, one target
## size, nothing to drag.
const VOLUME_STEPS := [1.0, 0.66, 0.33, 0.0]

func _volume_label() -> String:
	return TextManager.t("pause.volume", [int(round(AudioManager.get_master_volume() * 100.0))])

func _cycle_volume() -> void:
	var now := AudioManager.get_master_volume()
	var nearest := 0
	for i in VOLUME_STEPS.size():
		if absf(float(VOLUME_STEPS[i]) - now) < absf(float(VOLUME_STEPS[nearest]) - now):
			nearest = i
	AudioManager.set_master_volume(float(VOLUME_STEPS[(nearest + 1) % VOLUME_STEPS.size()]))
	# After the change, not before: this row's click is the demonstration. It is
	# also why the row opts out of BrandButton's own click - two in a row reads
	# as a glitch rather than as "this is how loud that is now".
	AudioManager.play_event("button")
	if is_instance_valid(_volume_btn):
		_volume_btn.text = _volume_label()

## A toggle that sounds the same in both positions is not a toggle.
##
## The order is the whole of it, and it is forced by what mute does: the OFF cue
## has to play BEFORE the mute lands or it is swallowed by it, and the ON cue has
## to play AFTER the mute lifts for exactly the same reason. Two sounds rather
## than one shared click, because "off" is the only setting in the game whose
## confirmation is silence -- so the last thing a child hears has to say which
## way the switch went.
func _toggle_sound() -> void:
	var now_muted := not AudioManager.is_muted()
	if now_muted:
		AudioManager.play_event("toggle_off")
	AudioManager.set_muted(now_muted)
	if not now_muted:
		AudioManager.play_event("toggle_on")
	if is_instance_valid(_sound_btn):
		_sound_btn.text = _sound_label()

func _card_face() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(ThemeManager.get_color_value("ink"), 0.92)
	box.set_corner_radius_all(CARD_CORNER)
	box.set_border_width_all(3)
	box.border_color = Color(ThemeManager.get_color_value("paper"), 0.45)
	box.set_content_margin_all(CARD_PAD)
	return box

func _button(parent: Node, text: String, cb: Callable, role: int = BrandButton.Role.SECONDARY) -> BrandButton:
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
