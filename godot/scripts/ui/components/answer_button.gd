extends Button
class_name AnswerButton
## One MCQ option on the maths board.
##
## Exists because the board previously used Godot's default Button theme: four
## grey slabs with the world showing through them, indistinguishable from each
## other and from a disabled control. A child has to be able to tell at a glance
## that these are the things you touch, and afterwards, which one they touched
## and how it went.
##
## brand/BRAND_SYSTEM.md §8 (interface) and §6 (Fixed Nine).

## Answered states. IDLE is the only one a child sees before they commit; the
## other two are the whole of the board's feedback vocabulary.
enum State { IDLE, RIGHT, WRONG }

const CORNER := 14
const SHAKE_PIXELS := 7.0
const SHAKE_SECONDS := 0.34

var _state: int = State.IDLE

func _ready() -> void:
	focus_mode = Control.FOCUS_ALL
	# The face is paper: an option is a card you pick up, and dark-on-light is
	# the easier direction to read a numeral in at speed.
	_restyle()
	ThemeManager.theme_changed.connect(func(_id): _restyle())

func set_state(state: int) -> void:
	_state = state
	_restyle()

func _fill() -> Color:
	match _state:
		State.RIGHT:
			return ThemeManager.get_color_value("yes")
		State.WRONG:
			return ThemeManager.get_color_value("notyet")
		_:
			return ThemeManager.get_color_value("paper")

func _restyle() -> void:
	var ink := ThemeManager.get_color_value("ink")
	var fill := _fill()
	add_theme_stylebox_override("normal", _face(fill, ink, 3))
	add_theme_stylebox_override("hover", _face(fill.lightened(0.12), ink, 3))
	add_theme_stylebox_override("pressed", _face(fill.darkened(0.12), ink, 3))
	# Focus is a thicker ink border, not a scale-up. The row lays these out side
	# by side, so a focused button that grew made its neighbours shuffle and the
	# four options stopped looking like a set.
	add_theme_stylebox_override("focus", _face(fill, ThemeManager.get_color_value("focus"), 5))
	# A disabled option during the wrong-answer beat should read as "wait", not
	# as "broken": it keeps its colour and loses only some of its light.
	add_theme_stylebox_override("disabled", _face(fill.darkened(0.18), ink, 3))

	# Ink on every state: paper, green and orange are all light enough to carry
	# dark text, which keeps the numeral legible through a colour change.
	for role in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_disabled_color"]:
		add_theme_color_override(role, ink)

func _face(fill: Color, border: Color, width: int) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.set_corner_radius_all(CORNER)
	box.set_border_width_all(width)
	box.border_color = border
	# A little weight under the card so it sits on the board rather than in it.
	box.shadow_color = Color(ThemeManager.get_color_value("ink"), 0.35)
	box.shadow_size = 4
	box.shadow_offset = Vector2(0, 3)
	return box

## The wrong-answer shake. Deliberately small and quick: this is "not that one",
## not a punishment, and a 7-year-old is going to see it often.
func shake() -> void:
	if UiFx.reduced_motion():
		return
	var home := position.x
	var tw := create_tween()
	for offset in [-SHAKE_PIXELS, SHAKE_PIXELS, -SHAKE_PIXELS * 0.5, SHAKE_PIXELS * 0.5, 0.0]:
		tw.tween_property(self, "position:x", home + offset, SHAKE_SECONDS / 5.0) \
			.set_trans(Tween.TRANS_SINE)

func get_state() -> int:
	return _state
