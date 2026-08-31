extends Control
class_name PerfectTick
## "Every big coin in this world, in one go." The mark on the journey screen.
##
## A DRAWN tick rather than a character, for the same reason ReplayHint is a
## drawn arc: U+2713 is far above Latin-1, Godot's built-in font has no picture
## for it, and tools/validate_i18n.mjs refuses anything above U+00FF — the PIN
## dots, the locked-level padlock and the dialog advance arrow were all boxes
## printing their own hex codepoint before they became graphics.
##
## Inside a filled disc rather than a bare stroke. On the journey screen this
## sits at the end of a row of coin pips, which are also small round shapes in
## roughly this colour, and a loose two-stroke tick beside them read as a fourth
## pip that had gone wrong. The disc is what makes it a badge.
##
## Coin-yellow, because it is a statement about coins and the child already knows
## what that colour means everywhere else in the game.

## How much of the box the disc fills. The rest is breathing room, so the badge
## does not touch the pips on its left or the percentage on its right.
const DISC_SCALE := 0.86
## The tick inside it, as a fraction of the disc's radius. Measured from the
## corner where the two strokes meet, which is the part of a tick the eye lands
## on first.
const SHORT_ARM := 0.42
const LONG_ARM := 0.78
const THICKNESS := 3.0

func _draw() -> void:
	var centre := size * 0.5
	var r := minf(size.x, size.y) * 0.5 * DISC_SCALE
	draw_circle(centre, r, ThemeManager.get_color_value("coin"))
	# The tick sits slightly low and left of centre: a geometrically centred tick
	# reads as high, because its long arm carries all the visual weight upward.
	var corner := centre + Vector2(-r * 0.12, r * 0.30)
	var ink := ThemeManager.get_color_value("ink")
	draw_line(corner, corner + Vector2(-r * SHORT_ARM, -r * SHORT_ARM), ink, THICKNESS)
	draw_line(corner, corner + Vector2(r * LONG_ARM, -r * LONG_ARM), ink, THICKNESS)
