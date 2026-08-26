extends TouchScreenButton
class_name TouchPad
## One on-screen control.
##
## What this replaced: a flat translucent rectangle with a word printed on it -
## `<`, `>`, `ZAP`, `JUMP`, `PECK`. Three of the five carried their whole meaning
## in a word, for a player who is still learning to read, against the brand rule
## (§12) that icons must carry every essential meaning. Two more used text glyphs
## as UI primitives, which this project has already been bitten by twice.
##
## PECK is gone entirely, icon and action both: it was drawn well and bound to
## nothing. See TouchControls.
##
## Icons are drawn from geometry rather than shipped as art: they have to stay
## crisp at any viewport scale, they must not need a translation, and there is no
## artist time to spend on four glyphs that are this simple.
##
## brand/BRAND_SYSTEM.md §8.1 (safe area), §12 (accessibility).

enum Icon { LEFT, RIGHT, JUMP, ZAP }

const CORNER := 22.0
const RIM := 3.0
## How much the plate grows under a thumb. The press has to be visible around a
## finger that is covering most of the button, so the change is on the rim and
## the fill, not only inside.
const PRESS_GROW := 3.0

var icon: int = Icon.LEFT
var box := 88.0

static func make(action: String, which: int, at: Vector2, size: float) -> TouchPad:
	var pad := TouchPad.new()
	pad.action = action
	pad.icon = which
	pad.box = size
	pad.position = at
	var shape := RectangleShape2D.new()
	shape.size = Vector2(size, size)
	pad.shape = shape
	pad.shape_centered = false
	return pad

func _ready() -> void:
	pressed.connect(queue_redraw)
	released.connect(queue_redraw)
	ThemeManager.theme_changed.connect(func(_id): queue_redraw())

func _draw() -> void:
	var down := is_pressed()
	var ink := ThemeManager.get_color_value("ink")
	var paper := ThemeManager.get_color_value("paper")
	var coin := ThemeManager.get_color_value("coin")

	var grow := PRESS_GROW if down else 0.0
	var rect := Rect2(Vector2(-grow, -grow), Vector2(box + grow * 2.0, box + grow * 2.0))

	var plate := StyleBoxFlat.new()
	plate.bg_color = Color(coin, 0.92) if down else Color(ink, 0.42)
	plate.set_corner_radius_all(int(CORNER))
	plate.set_border_width_all(int(RIM))
	plate.border_color = ink if down else Color(paper, 0.62)
	draw_style_box(plate, rect)

	# The eye is punched in the plate's own colour, so it reads as a hole rather
	# than as a third colour on a two-colour icon.
	_draw_icon(rect, ink if down else paper, plate.bg_color)

## Each icon is drawn inside the plate's own rect, so it follows the press grow.
func _draw_icon(rect: Rect2, tint: Color, plate_fill: Color) -> void:
	var c := rect.position + rect.size * 0.5
	var r := rect.size.x * 0.26
	match icon:
		Icon.LEFT:
			draw_colored_polygon(PackedVector2Array([
				c + Vector2(-r, 0), c + Vector2(r * 0.7, -r), c + Vector2(r * 0.7, r)]), tint)
		Icon.RIGHT:
			draw_colored_polygon(PackedVector2Array([
				c + Vector2(r, 0), c + Vector2(-r * 0.7, -r), c + Vector2(-r * 0.7, r)]), tint)
		Icon.JUMP:
			# An arrow with a floor line under it: the arrow alone reads as "up",
			# the line is what makes it read as leaving the ground.
			draw_colored_polygon(PackedVector2Array([
				c + Vector2(0, -r * 1.15), c + Vector2(-r, r * 0.15), c + Vector2(r, r * 0.15)]), tint)
			draw_line(c + Vector2(-r * 0.9, r * 0.85), c + Vector2(r * 0.9, r * 0.85), tint, 5.0)
		Icon.ZAP:
			draw_colored_polygon(PackedVector2Array([
				c + Vector2(r * 0.15, -r * 1.15), c + Vector2(-r * 0.75, r * 0.15),
				c + Vector2(-r * 0.05, r * 0.15), c + Vector2(-r * 0.15, r * 1.15),
				c + Vector2(r * 0.75, -r * 0.15), c + Vector2(r * 0.05, -r * 0.15)]), tint)
