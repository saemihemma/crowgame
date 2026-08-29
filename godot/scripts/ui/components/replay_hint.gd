extends BaseButton
class_name ReplayHint
## "Watch that again" — the circular arrow beside a lesson's progress dots.
##
## A drawn arc rather than a character. The circular-arrow glyph lives far above
## Latin-1, Godot's built-in font has no picture for it, and
## tools/validate_i18n.mjs refuses anything above U+00FF for exactly that reason
## — the PIN dots, the locked-level padlock and the dialog advance arrow were all
## boxes printing their own hex codepoint before they became Graphics.
##
## It is a SIGN, not the button. The whole picture above it is the tap target and
## clears Gate B3's 88px floor many times over; this is small on purpose, because
## a control the size of a thumb sitting in the progress row would read as the
## most important thing on the card, which it very much is not.

## Painted in the same accent as the dots it sits beside, passed in rather than
## resolved here so the row cannot end up two different colours.
var tint := Color.WHITE:
	set(value):
		tint = value
		queue_redraw()

const THICKNESS := 2.0
## Three-quarters of a turn. A full circle has no beginning and reads as a ring;
## the gap plus the arrowhead is what makes it a direction.
const SWEEP_FROM := PI * 0.35
const SWEEP_TO := PI * 1.85

func _draw() -> void:
	var r := minf(size.x, size.y) * 0.42
	var centre := size * 0.5
	draw_arc(centre, r, SWEEP_FROM, SWEEP_TO, 24, tint, THICKNESS)
	var tip := centre + Vector2(cos(SWEEP_FROM), sin(SWEEP_FROM)) * r
	draw_line(tip, tip + Vector2(-r * 0.45, -r * 0.15), tint, THICKNESS)
	draw_line(tip, tip + Vector2(-r * 0.1, -r * 0.5), tint, THICKNESS)
