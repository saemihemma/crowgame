extends Control
class_name VerdictMark
## Right or wrong, as a drawn mark.
##
## DRAWN AND NOT TYPED, for the same reason the login screen's PIN dots are
## drawn: U+2713 and U+2717 live in Unicode blocks Godot's built-in font does not
## carry, so a tick written as a character renders as a missing-glyph box
## printing its own hex codepoint. The i18n guard would have caught it -- nothing
## above U+00FF is allowed in a bundle -- but the honest answer is that a tick is
## not text at all. It says the same thing in every language, so putting it in
## the string tables would be asking a translator to translate a shape.
##
## Two strokes and three, at the colours the rest of the grown-up report uses for
## the same verdict, so a mark and the bar above it agree.

const STROKE := 3.0
## Inset from the box, so two marks side by side have air between them.
const PAD := 0.24

var correct := true

static func make(is_correct: bool, box: float) -> VerdictMark:
	var mark := VerdictMark.new()
	mark.correct = is_correct
	mark.custom_minimum_size = Vector2(box, box)
	mark.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return mark

func _draw() -> void:
	var colour := StatBar.colour_for(1.0 if correct else 0.0)
	var pad := size * PAD
	var box := Rect2(pad, size - pad * 2.0)
	if correct:
		# A tick: down to the low point at a third across, then up past the top.
		var low := Vector2(box.position.x + box.size.x * 0.38, box.end.y)
		draw_line(Vector2(box.position.x, box.position.y + box.size.y * 0.55), low, colour, STROKE, true)
		draw_line(low, Vector2(box.end.x, box.position.y), colour, STROKE, true)
	else:
		draw_line(box.position, box.end, colour, STROKE, true)
		draw_line(Vector2(box.end.x, box.position.y), Vector2(box.position.x, box.end.y),
			colour, STROKE, true)
