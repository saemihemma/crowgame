extends Button
class_name BrandButton
## Every button outside the maths board.
##
## The menus shipped Godot's default Button theme - identical grey slabs for
## "PLAY", "CONTINUE", "+ New User" and a locked level alike. Nothing told a
## child which one mattered, and nothing looked like it belonged to this game.
##
## Three roles, and the whole point is that a screen uses exactly one PRIMARY:
## the single thing you are meant to press.
##
## brand/BRAND_SYSTEM.md §8 (interface), §6 (Fixed Nine).

enum Role { PRIMARY, SECONDARY, GHOST }

const CORNER := 18
const PAD_X := 34
const PAD_Y := 16
## Gate B3: nothing tappable is smaller than 88px on its short edge.
const MIN_HEIGHT := 88.0
const PULSE_SECONDS := 1.6
const PULSE_SCALE := 0.022

var role: int = Role.SECONDARY
## A primary action breathes so the eye lands on it without needing an arrow or
## a "click here". Off for the others: three pulsing buttons is a fairground.
var pulse := false
## Every button acknowledges the press. Set false only where the row's own
## callback plays something better placed than the click would be.
##
## This lives here because "a button was pressed" is one moment, not thirty. The
## click used to be fired by hand at three call sites, so PLAY, every world card,
## every login row and both grown-up panels were silent, and nobody had a list of
## which ones were missing it.
var clicks := true

static func make(text: String, button_role: int, on_press: Callable) -> BrandButton:
	var b := BrandButton.new()
	b.role = button_role
	b.pulse = button_role == Role.PRIMARY
	b.text = text
	if on_press.is_valid():
		b.pressed.connect(on_press)
	return b


func _pressed() -> void:
	if clicks:
		AudioManager.play_event("button")

func _ready() -> void:
	custom_minimum_size.y = maxf(custom_minimum_size.y, MIN_HEIGHT)
	focus_mode = Control.FOCUS_ALL
	add_theme_font_size_override("font_size", 30 if role == Role.PRIMARY else 26)
	_restyle()
	ThemeManager.theme_changed.connect(func(_id): _restyle())
	if pulse:
		_start_pulse.call_deferred()

func _start_pulse() -> void:
	if UiFx.reduced_motion() or not is_inside_tree():
		return
	pivot_offset = size / 2.0
	var tw := create_tween().set_loops()
	tw.tween_property(self, "scale", Vector2.ONE * (1.0 + PULSE_SCALE), PULSE_SECONDS * 0.5) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.tween_property(self, "scale", Vector2.ONE, PULSE_SECONDS * 0.5) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


func _fill() -> Color:
	match role:
		Role.PRIMARY:
			return ThemeManager.get_color_value("coin")
		Role.SECONDARY:
			return ThemeManager.get_color_value("paper")
		_:
			return Color(ThemeManager.get_color_value("ink"), 0.34)

func _label() -> Color:
	# Ghost is the only role on a dark fill, so it is the only one with light
	# text. The other two are dark-on-light, which reads faster.
	return ThemeManager.get_color_value("paper") if role == Role.GHOST \
		else ThemeManager.get_color_value("ink")

func _restyle() -> void:
	var fill := _fill()
	var ink := ThemeManager.get_color_value("ink")
	var border: Color = ThemeManager.get_color_value("paper") if role == Role.GHOST else ink
	add_theme_stylebox_override("normal", _face(fill, border, 3))
	add_theme_stylebox_override("hover", _face(fill.lightened(0.10), border, 3))
	add_theme_stylebox_override("pressed", _face(fill.darkened(0.10), border, 3))
	# Focus thickens the border in `focus` white rather than scaling the button:
	# a button that grows on focus shoves its neighbours around, which is what
	# made the maths board's four options stop reading as a set.
	add_theme_stylebox_override("focus", _face(fill, ThemeManager.get_color_value("focus"), 5))
	add_theme_stylebox_override("disabled", _face(fill.darkened(0.28), border, 3))

	var label := _label()
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		add_theme_color_override(state, label)
	add_theme_color_override("font_disabled_color", Color(label, 0.55))

func _face(fill: Color, border: Color, width: int) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.set_corner_radius_all(CORNER)
	box.set_border_width_all(width)
	box.border_color = border
	box.content_margin_left = PAD_X
	box.content_margin_right = PAD_X
	box.content_margin_top = PAD_Y
	box.content_margin_bottom = PAD_Y
	box.shadow_color = Color(ThemeManager.get_color_value("ink"), 0.42)
	box.shadow_size = 6
	box.shadow_offset = Vector2(0, 4)
	return box
