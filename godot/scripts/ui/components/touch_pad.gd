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

enum Icon { LEFT, RIGHT, JUMP, ZAP, SPRINT }

const CORNER := 22.0
const RIM := 3.0
## How far outside the drawn plate a finger still counts.
##
## A thumb is not a mouse pointer: it lands as a broad, wobbling patch whose
## reported point drifts, and a child aiming one at a rounded plate misses the
## edge constantly. Every mobile toolkit that works has some version of this. The
## plate is drawn inset by exactly this much inside the pressable square, so the
## button looks the size it always did and forgives a near miss.
##
## 6, not more: the gap between two pads is 14, so their hit areas stop 2 apart
## and no press is ever ambiguous between neighbours -- which would be a worse
## bug than the one this fixes.
const HIT_MARGIN := 6.0
## How much the plate grows under a thumb. The press has to be visible around a
## finger that is covering most of the button, so the change is on the rim and
## the fill, not only inside.
const PRESS_GROW := 3.0

var icon: int = Icon.LEFT
var box := 88.0

## The action a LATCHING pad drives, held in a field of our own because
## TouchScreenButton.action is momentary by construction: the engine presses it on
## touch-down and releases it on touch-up, which is the behaviour a latch exists
## to replace. Empty on a momentary pad.
var _latch_action := ""
var _latched := false

static func make(action: String, which: int, at: Vector2, size: float) -> TouchPad:
	var pad := _bare(which, at, size)
	pad.action = action
	return pad

## A pad that stays down until it is tapped again.
##
## WHY SPRINT NEEDS THIS. A running jump is direction + sprint + jump, held
## together. On the keyboard that is three fingers and nothing to think about. On
## this layout it is two thumbs: the left holds a direction, the right reaches
## jump. A momentary sprint pad would need a third, so a child could sprint or
## jump but never both -- and every gap worth sprinting at needs both. Latched,
## the left thumb taps sprint once and goes back to holding the direction.
##
## The lit plate is the state readout: a latched pad draws exactly as a held one
## does, because it IS held.
static func make_latching(action: String, which: int, at: Vector2, size: float) -> TouchPad:
	var pad := _bare(which, at, size)
	pad._latch_action = action
	return pad

static func _bare(which: int, at: Vector2, size: float) -> TouchPad:
	var pad := TouchPad.new()
	pad.icon = which
	pad.box = size
	pad.position = at
	var shape := RectangleShape2D.new()
	# The pressable square is the plate plus a margin on every side. The node's
	# position is the HIT origin; the plate is drawn inset by HIT_MARGIN, so
	# drawn_rect() is what the child sees and this is what answers a thumb.
	shape.size = Vector2(size + HIT_MARGIN * 2.0, size + HIT_MARGIN * 2.0)
	pad.shape = shape
	pad.shape_centered = false
	# A thumb that slides onto a pad presses it.
	#
	# Off by default, which means a finger already down when it arrives over a
	# button is ignored until it lifts and lands again. On a d-pad that is the
	# difference between steering and stabbing: a child rolling their thumb from
	# left to right gets nothing at all until they lift off, and a thumb that
	# drifts a few pixels off the plate and back has to be re-pressed. From the
	# sofa that is "sometimes it registers".
	pad.passby_press = true
	return pad

## Where the plate is DRAWN, which is smaller than what it answers to.
##
## The gates measure this and not the hit area: gate B3 is about whether a child
## can see and aim at a target, and a generous invisible margin must not be
## allowed to paper over a plate that is too small to find.
func drawn_rect() -> Rect2:
	return Rect2(position + Vector2(HIT_MARGIN, HIT_MARGIN), Vector2(box, box))

func hit_rect() -> Rect2:
	var size := (shape as RectangleShape2D).size if shape is RectangleShape2D else Vector2.ZERO
	return Rect2(position, size)

## Let go of whatever this pad is holding.
##
## Called when the controls are hidden, which happens the moment an owl opens a
## maths board -- and a board can open while a thumb is mid-press, because it
## opens on proximity rather than on a button. A TouchScreenButton that is hidden
## under a finger never sees the finger lift, so its action stays down: the child
## answers the question, the board closes, and the crow walks off on its own into
## the next owl or the next pit.
func release() -> void:
	if _latched:
		_latched = false
	var held := pad_action()
	if held != "" and Input.is_action_pressed(held):
		Input.action_release(held)
	queue_redraw()

## The action this pad drives, whichever way it drives it. Callers and the gate
## tests read the binding through this rather than off `action`, which is empty on
## a latching pad.
func pad_action() -> String:
	return action if action != "" else _latch_action

func is_latching() -> bool:
	return _latch_action != ""

func is_latched() -> bool:
	return _latched

## Flip the latch. Public because the press path cannot be exercised headlessly --
## TouchScreenButton does its own screen-to-canvas hit testing, which a headless
## tree has no canvas for (see test_touch_controls.gd) -- so the behaviour is
## tested by calling this, and the wiring below is what a finger reaches.
func toggle_latch() -> void:
	if not is_latching():
		return
	_latched = not _latched
	if _latched:
		Input.action_press(_latch_action)
	else:
		Input.action_release(_latch_action)
	queue_redraw()

func _ready() -> void:
	pressed.connect(queue_redraw)
	released.connect(queue_redraw)
	if is_latching():
		pressed.connect(toggle_latch)
	ThemeManager.theme_changed.connect(func(_id): queue_redraw())

## A latched action is pressed in the global Input state, not in this node, so a
## pad that goes away while latched leaves the crow sprinting forever -- through
## the next level, and the one after that. Freed on a level change like everything
## else in the scene, so this is not hypothetical.
func _exit_tree() -> void:
	if _latched:
		Input.action_release(_latch_action)
		_latched = false

func _draw() -> void:
	var down := is_pressed() or _latched
	var ink := ThemeManager.get_color_value("ink")
	var paper := ThemeManager.get_color_value("paper")
	var coin := ThemeManager.get_color_value("coin")

	var grow := PRESS_GROW if down else 0.0
	# Inset by HIT_MARGIN: the node's origin is the hit area's corner, and the
	# plate is drawn inside it.
	var rect := Rect2(Vector2(HIT_MARGIN - grow, HIT_MARGIN - grow),
		Vector2(box + grow * 2.0, box + grow * 2.0))

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
		Icon.SPRINT:
			# Two open chevrons and three speed lines behind them. It has to read
			# as "faster" to a child who cannot read, and it has to not read as
			# RIGHT -- which is why the chevrons are STROKED and RIGHT's arrow is
			# a solid triangle: one filled shape versus a group of thin ones is a
			# difference visible at a glance and under a thumb.
			var w := maxf(4.0, r * 0.22)
			for i in 2:
				var nose := c + Vector2(r * (0.15 + 0.55 * float(i)), 0)
				draw_line(nose + Vector2(-r * 0.5, -r * 0.62), nose, tint, w)
				draw_line(nose, nose + Vector2(-r * 0.5, r * 0.62), tint, w)
			for i in 3:
				var y := c.y + r * (float(i) - 1.0) * 0.62
				var len_x := r * (0.62 if i == 1 else 0.40)
				draw_line(Vector2(c.x - r * 1.05, y), Vector2(c.x - r * 1.05 + len_x, y), tint, w * 0.8)
		Icon.ZAP:
			draw_colored_polygon(PackedVector2Array([
				c + Vector2(r * 0.15, -r * 1.15), c + Vector2(-r * 0.75, r * 0.15),
				c + Vector2(-r * 0.05, r * 0.15), c + Vector2(-r * 0.15, r * 1.15),
				c + Vector2(r * 0.75, -r * 0.15), c + Vector2(r * 0.05, -r * 0.15)]), tint)
