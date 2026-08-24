extends RefCounted
class_name LanguageToggle
## Language selector — Godot port of src/ui/components/LanguageToggle.ts.
##
## A segmented control rather than a dropdown: with exactly two languages a
## dropdown hides half the choices behind a tap and hands a five-year-old a menu
## to get lost in. Both options stay visible, one tap switches, no confirm step.
##
## Two deliberate details:
##  - Each language is labelled in its own language (TextManager.endonym) and
##    those labels are never translated. Someone stranded in a language they
##    cannot read has to be able to find their way back out.
##  - The selected state is a filled pill *and* a drawn tick, never colour
##    alone. The tick is a Line2D, not a font glyph, so it cannot become the
##    missing-glyph box that the PIN dots used to be.

const PILL_SIZE := Vector2(132.0, 44.0)
const PILL_GAP := 6
const MARGIN := 20.0
const FONT_SIZE := 20
const TICK_WIDTH := 3.0
const CORNER_RADIUS := 10


## Build the control, anchored to the top-right of its parent.
## `on_change` is called after the locale actually changes; callers normally
## reload the current scene from there.
static func build(on_change: Callable) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", PILL_GAP)

	var codes: Array = TextManager.available_locales()
	var total_w: float = PILL_SIZE.x * codes.size() + PILL_GAP * (codes.size() - 1)

	row.anchor_left = 1.0
	row.anchor_top = 0.0
	row.anchor_right = 1.0
	row.anchor_bottom = 0.0
	row.offset_left = -(total_w + MARGIN)
	row.offset_right = -MARGIN
	row.offset_top = MARGIN
	row.offset_bottom = MARGIN + PILL_SIZE.y

	var active := TextManager.get_locale()
	for code in codes:
		var locale := String(code)
		var selected := locale == active

		var pill := Button.new()
		pill.text = TextManager.endonym(locale)
		pill.custom_minimum_size = PILL_SIZE
		pill.add_theme_font_size_override("font_size", FONT_SIZE)
		_apply_style(pill, selected)
		if selected:
			pill.add_child(_make_tick())
		pill.pressed.connect(_select.bind(locale, on_change))
		UiFx.attach_focus_highlight(pill)
		row.add_child(pill)

	return row


static func _select(locale: String, on_change: Callable) -> void:
	if TextManager.get_locale() == locale:
		return
	AudioManager.play_sfx("ui_click")
	TextManager.set_locale(locale)
	if on_change.is_valid():
		on_change.call()


static func _apply_style(pill: Button, selected: bool) -> void:
	var accent := ThemeManager.get_color_value("accent")
	var light := ThemeManager.get_color_value("text_light")

	# Selected reads as filled, unselected as outline. Fill-versus-outline is a
	# shape difference, so the state survives for a colour-blind player too.
	for state in ["normal", "hover", "pressed", "focus"]:
		var box := StyleBoxFlat.new()
		box.set_corner_radius_all(CORNER_RADIUS)
		box.bg_color = accent if selected else Color(light, 0.0)
		box.border_color = Color(light, 0.5 if selected else 0.3)
		box.set_border_width_all(2)
		pill.add_theme_stylebox_override(state, box)

	var label_colour := ThemeManager.get_color_value("boardBorder") if selected else light
	pill.add_theme_color_override("font_color", label_colour)
	pill.add_theme_color_override("font_hover_color", label_colour)
	pill.add_theme_color_override("font_pressed_color", label_colour)
	pill.add_theme_color_override("font_focus_color", label_colour)


## The tick, as a polyline rather than a text character.
static func _make_tick() -> Line2D:
	# Godot centres Button text, so the tick has to live in the sliver left of
	# it. Kept narrow and hard against the edge: at 14px in it collided with the
	# label and "Íslenska" rendered as "<tick>slenska".
	var tick := Line2D.new()
	var left := 7.0
	var mid_y := PILL_SIZE.y * 0.5
	tick.points = PackedVector2Array([
		Vector2(left, mid_y + 0.5),
		Vector2(left + 4.0, mid_y + 4.0),
		Vector2(left + 10.0, mid_y - 5.0),
	])
	tick.width = TICK_WIDTH
	tick.default_color = ThemeManager.get_color_value("boardBorder")
	tick.joint_mode = Line2D.LINE_JOINT_ROUND
	tick.begin_cap_mode = Line2D.LINE_CAP_ROUND
	tick.end_cap_mode = Line2D.LINE_CAP_ROUND
	return tick
