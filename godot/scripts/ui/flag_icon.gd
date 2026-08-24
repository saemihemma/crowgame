extends Control
class_name FlagIcon
## Flag icons for the language selector, drawn as vector geometry.
## Godot port of src/ui/components/FlagIcon.ts -- keep the two in step.
##
## WHY NOT EMOJI
## -------------
## A flag emoji is a pair of regional-indicator code points (U+1F1EE U+1F1F8)
## far outside Latin-1, and whether it becomes a flag depends entirely on the
## font. This export bundles one font with no emoji coverage at all, so here the
## pair would be two missing-glyph boxes -- precisely the tofu that started this
## localisation work. (In the browser it is no safer: Windows ships no flag
## glyphs, so Chrome renders the pair as the letters "IS" and "US".)
##
## So the flags are drawn, like the PIN dots and the selected-state tick before
## them. A handful of rects and dots each, identical on every platform, no font
## involved. godot/tests/test_flag_icon.gd checks the shared proportions.

## Official flag colours. Deliberately NOT theme colours -- a flag that
## restyled itself with the forest/scifi skin would stop being a flag. This is
## what the hardcode guard's escape hatch is for.
const IS_BLUE := Color("#02529c") # hardcode-ok
const IS_RED := Color("#dc1e35") # hardcode-ok
const US_RED := Color("#b22234") # hardcode-ok
const US_BLUE := Color("#3c3b6e") # hardcode-ok

## Nordic cross proportions, as fractions. Thicknesses are relative to HEIGHT --
## that is how a Nordic cross is specified, so the arms stay square -- and the
## vertical arm sits toward the hoist rather than centred. That offset is what
## makes it read as Icelandic instead of as a plus sign.
const CROSS_WHITE_T := 0.24
const CROSS_RED_T := 0.12
const CROSS_VERTICAL_CX := 0.36

## The real US flag has 13 stripes. At the height this renders at they would be
## about a pixel each and blur into flat pink, so seven are drawn: still starting
## and ending red like the real flag, and actually legible. Legibility at the
## size it is drawn beats a correct count nobody can see.
const US_STRIPES := 7
const US_CANTON_STRIPES := 4
const US_CANTON_W := 0.42

var locale: String = "en"


static func make(code: String, box: Vector2) -> FlagIcon:
	var icon := FlagIcon.new()
	icon.locale = code
	icon.custom_minimum_size = box
	icon.size = box
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return icon


func _draw() -> void:
	var w := size.x
	var h := size.y
	if locale == "is":
		_draw_iceland(w, h)
	else:
		_draw_united_states(w, h)
	# A hairline border so a white stripe or the white cross does not bleed into
	# a light pill background.
	draw_rect(Rect2(0.0, 0.0, w, h), Color(0, 0, 0, 0.35), false, 1.0) # hardcode-ok


func _draw_iceland(w: float, h: float) -> void:
	draw_rect(Rect2(0.0, 0.0, w, h), IS_BLUE, true)
	var cx := w * CROSS_VERTICAL_CX
	var cy := h * 0.5
	for pair in [[Color.WHITE, CROSS_WHITE_T], [IS_RED, CROSS_RED_T]]:
		var colour: Color = pair[0]
		var bar: float = h * float(pair[1])
		draw_rect(Rect2(cx - bar * 0.5, 0.0, bar, h), colour, true)
		draw_rect(Rect2(0.0, cy - bar * 0.5, w, bar), colour, true)


func _draw_united_states(w: float, h: float) -> void:
	var stripe_h := h / float(US_STRIPES)
	draw_rect(Rect2(0.0, 0.0, w, h), Color.WHITE, true)
	for i in range(0, US_STRIPES, 2):
		draw_rect(Rect2(0.0, i * stripe_h, w, stripe_h), US_RED, true)

	var canton_w := w * US_CANTON_W
	var canton_h := stripe_h * US_CANTON_STRIPES
	draw_rect(Rect2(0.0, 0.0, canton_w, canton_h), US_BLUE, true)

	# Stars as a 3x2 grid of dots. At this size individual points are all that
	# survives; the grid is what says "stars" rather than "plain blue".
	var dot := maxf(0.9, canton_h * 0.09)
	for row in 2:
		for col in 3:
			draw_circle(
				Vector2(canton_w * (0.26 + col * 0.24), canton_h * (0.32 + row * 0.36)),
				dot,
				Color.WHITE,
			)
