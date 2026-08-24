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
##
## The flag is there for the child who cannot read yet: at five, a flag is
## recognisable a beat before "Íslenska" is. It sits beside the endonym rather
## than replacing it, because a flag names a country and not a language -- the
## word is what identifies the choice, and it is what a player who does not
## recognise a flag falls back on. Like the tick it is drawn geometry, not an
## emoji; flag_icon.gd explains why that matters more than it looks.

## Layout, left to right inside a pill: pad, tick, gap, flag, gap, label.
##
## The label is LEFT-aligned with a content margin equal to everything before it,
## which is what keeps the three elements in the same order as the web build.
## Godot Buttons centre their text by default, and centring here would need a
## 207px pill to clear the decorations.
##
## The width budget comes from the LOGIN screen, not the menu. Godot draws
## "HÖRMANN" at 96px but positions it well below the toggle (y 130+ against the
## toggle's y 20..64), so the menu has no horizontal collision -- which made it
## look like there was slack. There is not: login centres "Who's playing?" on the
## same row as the toggle, and it ends at x 613. Adding the flag took the pill
## from 132px to 156px and left 3px of clearance, measured off the exported
## build. These gaps put the row back at x 636 for 23px.
const PAD_LEFT := 6.0
const TICK_SIZE := 12.0
const TICK_GAP := 4.0
const FLAG_BOX := Vector2(26.0, 18.0)
const FLAG_GAP := 6.0
const LABEL_LEFT := PAD_LEFT + TICK_SIZE + TICK_GAP + FLAG_BOX.x + FLAG_GAP

const PILL_SIZE := Vector2(149.0, 44.0)
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
		pill.alignment = HORIZONTAL_ALIGNMENT_LEFT
		pill.add_theme_font_size_override("font_size", FONT_SIZE)
		_apply_style(pill, selected)

		var flag := FlagIcon.make(locale, FLAG_BOX)
		flag.position = Vector2(
			PAD_LEFT + TICK_SIZE + TICK_GAP,
			(PILL_SIZE.y - FLAG_BOX.y) * 0.5,
		)
		# The flag dims with its label so an unselected pill recedes as one unit;
		# a full-colour flag beside a faded word reads as the active choice.
		# White with an alpha, i.e. an opacity multiplier rather than a colour
		# choice -- the flag's own colours are untouched.
		flag.modulate = Color(1, 1, 1, 1.0 if selected else 0.72) # hardcode-ok
		pill.add_child(flag)

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
		# Reserve the space the tick and the flag occupy, so the label starts
		# after them instead of underneath them.
		box.content_margin_left = LABEL_LEFT
		pill.add_theme_stylebox_override(state, box)

	var label_colour := ThemeManager.get_color_value("boardBorder") if selected else light
	pill.add_theme_color_override("font_color", label_colour)
	pill.add_theme_color_override("font_hover_color", label_colour)
	pill.add_theme_color_override("font_pressed_color", label_colour)
	pill.add_theme_color_override("font_focus_color", label_colour)


## The tick, as a polyline rather than a text character.
static func _make_tick() -> Line2D:
	# The label's content margin now reserves room for both the tick and the
	# flag, so this no longer has to squeeze into a sliver -- before that, at
	# 14px in, it collided with the label and "Íslenska" rendered as
	# "<tick>slenska".
	var tick := Line2D.new()
	var left := PAD_LEFT
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
