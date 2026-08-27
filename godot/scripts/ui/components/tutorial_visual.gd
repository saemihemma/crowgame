extends Control
class_name TutorialVisual
## The picture on a tutorial card, drawn from data.
##
## Ten representations, each one the standard primary-maths model for the idea
## it carries: a ten-frame for quantity and bonds to ten, a number line for
## counting on and back, base-ten rods for place value, equal groups for
## multiplication and its mirror image, division. They are drawn rather than
## authored as art so a lesson costs a JSON entry instead of a sprite, and so
## every one of them recolours with the world's theme.
##
## Adding an eleventh is one entry in RENDERERS and one _draw_ function. Nothing
## else in the tutorial knows the list.
##
## Geometry comes from data/tuning/tutorial_tuning.json ("visual"), colour from
## the "roles" map in the same file, resolved through the active theme. There
## are no numbers and no colours in this file that a designer cannot move.

const RENDERERS := {
	"count_all": "_draw_count_all",
	"ten_frame": "_draw_ten_frame",
	"number_line": "_draw_number_line",
	"take_away": "_draw_take_away",
	"balance": "_draw_balance",
	"pattern_strip": "_draw_pattern_strip",
	"numbers": "_draw_numbers",
	"groups": "_draw_groups",
	"tens_and_ones": "_draw_tens_and_ones",
	"part_whole": "_draw_part_whole",
	"equation": "_draw_equation",
}

## How far the part-whole card's ink reaches past its bar, in numerals. Above:
## the bracket line at 0.7 plus the whole's numeral centred another 0.55 up, plus
## half a glyph. Below: the part labels centred 0.7 down, plus half a glyph.
## Written as constants because _draw_part_whole has to agree with itself in
## three places -- what it measures, where it puts the bar, and where it puts the
## numerals -- and the first version of this fix only changed one of them.
const ABOVE_BAR := 1.75
const BELOW_BAR := 1.2

## Everything the part-whole card draws, bar and numerals together. Static and
## arithmetic-only so a test can hold the renderer to it without a board, and so
## the renderer measures and positions from ONE expression rather than two that
## can drift apart.
static func part_whole_natural_size(bar: Vector2, numeral_size: float) -> Vector2:
	return Vector2(bar.x, numeral_size * ABOVE_BAR + bar.y + numeral_size * BELOW_BAR)

## The ten-frame is five and five, which is the whole reason it works: eight
## reads as "a full row and three", not as eight things to count one at a time.
const FRAME_COLUMNS := 5
const FRAME_ROWS := 2
const FRAME_CAPACITY := FRAME_COLUMNS * FRAME_ROWS

var _visual := ""
var _params: Dictionary = {}

func setup(visual: String, params: Dictionary) -> void:
	_visual = visual
	_params = params
	custom_minimum_size = Vector2(0, float(Config.tutorial("layout/visual_height", 190)))
	queue_redraw()

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	ThemeManager.theme_changed.connect(func(_id): queue_redraw())
	resized.connect(queue_redraw)

## Whether anything knows how to draw this name. Public so a test can assert the
## data and the renderer agree without instancing a whole tutorial.
static func can_draw(visual: String) -> bool:
	return RENDERERS.has(visual)

func _draw() -> void:
	if not RENDERERS.has(_visual):
		return
	call(RENDERERS[_visual])

# --- shared helpers -------------------------------------------------------

func _tune(key: String, fallback: float) -> float:
	return float(Config.tutorial("visual/%s" % key, fallback))

## A drawn part's colour: the part names a role in tutorial_tuning.json, that
## role names a palette entry, and the active theme supplies it. Two levels of
## indirection on purpose - a reskin never edits this file.
func _role(part: String, fallback_role: String) -> Color:
	return ThemeManager.get_color_value(String(Config.tutorial("roles/%s" % part, fallback_role)))

func _font() -> Font:
	return get_theme_default_font()

func _numeral(text: String, centre: Vector2, size_px: float, colour: Color) -> void:
	var font := _font()
	var measured := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, int(size_px))
	# draw_string anchors on the BASELINE, not the top: passing a centre straight
	# through drops every numeral roughly half a line below where it belongs.
	font.draw_string(get_canvas_item(), centre - Vector2(measured.x * 0.5, -measured.y * 0.32),
		text, HORIZONTAL_ALIGNMENT_LEFT, -1, int(size_px), colour)

func _token(centre: Vector2, radius: float, fill: Color) -> void:
	draw_circle(centre, radius, fill)
	draw_arc(centre, radius, 0.0, TAU, 24, _role("outline", "ink"), 2.5)

## A cross through a token that has been taken away. Subtraction needs the thing
## to still be visible after it is gone - a child who is shown five and then
## three has to count what was removed, not re-count what remains.
func _cross(centre: Vector2, radius: float) -> void:
	var w := _tune("cross_thickness", 4.0)
	var c := _role("outline", "ink")
	draw_line(centre + Vector2(-radius, -radius), centre + Vector2(radius, radius), c, w)
	draw_line(centre + Vector2(-radius, radius), centre + Vector2(radius, -radius), c, w)

## Lay `count` tokens out in a row, centred, wrapping if the row would overflow.
func _token_row(count: int, origin: Vector2, colours: Array) -> void:
	var token := _tune("token_size", 26.0)
	var gap := _tune("token_gap", 9.0)
	var per_row := maxi(1, int((size.x - token) / (token + gap)))
	var radius := token * 0.5
	for i in count:
		var col := i % per_row
		var row := i / per_row
		var wide: int = mini(count - row * per_row, per_row)
		var row_w := wide * token + maxf(0.0, wide - 1) * gap
		var at := Vector2(origin.x - row_w * 0.5 + col * (token + gap) + radius,
			origin.y + row * (token + gap))
		_token(at, radius, colours[i] if i < colours.size() else _role("token_a", "owl"))

func _int(key: String, fallback: int = 0) -> int:
	return int(_params.get(key, fallback))

# --- the ten representations ---------------------------------------------

## Two groups of objects, side by side and clearly separate. The first picture
## of addition a child should ever see: not a symbol, two piles.
func _draw_count_all() -> void:
	var a := _int("a")
	var b := _int("b")
	var token := _tune("token_size", 26.0)
	var gap := _tune("token_gap", 9.0)
	var group_gap := _tune("group_gap", 24.0)
	var a_w := a * token + maxf(0.0, a - 1) * gap
	var b_w := b * token + maxf(0.0, b - 1) * gap
	var total_w := a_w + (group_gap + b_w if b > 0 else 0.0)
	_fit(total_w, token + _tune("token_gap", 9.0))
	var y := size.y * 0.5
	var x := size.x * 0.5 - total_w * 0.5 + token * 0.5
	for i in a:
		_token(Vector2(x + i * (token + gap), y), token * 0.5, _role("token_a", "owl"))
	if b > 0:
		var bx := x + a_w + group_gap
		for i in b:
			_token(Vector2(bx + i * (token + gap), y), token * 0.5, _role("token_b", "accent"))

## Five and five, with the empty cells still drawn. The gaps are half the
## lesson: "six" and "four more to ten" are the same picture.
func _draw_ten_frame() -> void:
	var filled := _int("filled")
	var second := _int("second")
	var total := filled + second
	var frames := maxi(1, int(ceil(float(total) / float(FRAME_CAPACITY))))
	var token := _tune("token_size", 26.0)
	var gap := _tune("token_gap", 9.0)
	var frame_gap := _tune("frame_gap", 18.0)
	var cell := token + gap
	var frame_w := FRAME_COLUMNS * cell
	var frame_h := FRAME_ROWS * cell
	var total_w := frames * frame_w + maxf(0.0, frames - 1) * frame_gap
	_fit(total_w, frame_h)
	var origin := Vector2(size.x * 0.5 - total_w * 0.5, size.y * 0.5 - frame_h * 0.5)
	var border := _tune("frame_border", 3.0)
	var outline := _role("outline", "ink")

	for f in frames:
		var fx := origin.x + f * (frame_w + frame_gap)
		draw_rect(Rect2(Vector2(fx, origin.y), Vector2(frame_w, frame_h)), outline, false, border)
		for r in FRAME_ROWS:
			for c in FRAME_COLUMNS:
				var index := f * FRAME_CAPACITY + r * FRAME_COLUMNS + c
				var at := Vector2(fx + c * cell + cell * 0.5, origin.y + r * cell + cell * 0.5)
				if index < filled:
					_token(at, token * 0.5, _role("token_a", "owl"))
				elif index < total:
					_token(at, token * 0.5, _role("token_b", "accent"))
				else:
					draw_arc(at, token * 0.5, 0.0, TAU, 20, Color(outline, 0.35), 2.0)

## The line, with every number on it a child can reach. Hops are drawn as arcs
## rather than a slid marker because the count is the point: four hops IS "add
## four", and a child can put a finger on each one.
func _draw_number_line() -> void:
	var from := _int("from")
	var to := _int("to", 10)
	var span: int = maxi(1, to - from)
	var thickness := _tune("line_thickness", 4.0)
	var tick_h := _tune("tick_height", 12.0)
	var margin := _tune("token_size", 26.0)
	var y := size.y * 0.62
	var left := margin
	var right := maxf(margin + 1.0, size.x - margin)
	var line := _role("line", "paper")
	draw_line(Vector2(left, y), Vector2(right, y), line, thickness)

	# A tick per number while they still fit; every fifth once they do not, which
	# is also how a child is taught to read a longer line.
	var stride: int = 1 if span <= 20 else 5
	var numeral_size := _tune("numeral_font_size", 26.0) * (1.0 if span <= 12 else 0.75)
	var at_x := func(value: int) -> float:
		return left + (right - left) * float(value - from) / float(span)
	for v in range(from, to + 1):
		if (v - from) % stride != 0:
			continue
		var x: float = at_x.call(v)
		draw_line(Vector2(x, y - tick_h * 0.5), Vector2(x, y + tick_h * 0.5), line, thickness * 0.6)
		_numeral(str(v), Vector2(x, y + tick_h + numeral_size * 0.6), numeral_size, line)

	# The landmark: the ten a bridging problem stops at on the way past.
	if _params.has("mark"):
		var mx: float = at_x.call(_int("mark"))
		draw_circle(Vector2(mx, y), _tune("mark_radius", 9.0), _role("highlight", "yes"))

	# Comparison uses the same line with two numbers on it and no hops - which is
	# the honest picture of "greater": further along.
	if _params.has("marks"):
		for value: Variant in (_params["marks"] as Array):
			var vx: float = at_x.call(int(value))
			_token(Vector2(vx, y), _tune("mark_radius", 9.0), _role("mark", "accent"))
		return

	if not _params.has("start"):
		return
	var start := _int("start")
	var hops := _int("hops")
	_token(Vector2(at_x.call(start), y), _tune("mark_radius", 9.0), _role("mark", "accent"))
	var step := 1 if hops >= 0 else -1
	var height := _tune("hop_height", 34.0)
	var points := maxi(4, int(_tune("hop_points", 20.0)))
	var hop_colour := _role("hop", "accent")
	for i in absi(hops):
		var a: float = at_x.call(start + i * step)
		var b: float = at_x.call(start + (i + 1) * step)
		var arc := PackedVector2Array()
		for p in points + 1:
			var t := float(p) / float(points)
			arc.append(Vector2(lerpf(a, b, t), y - sin(t * PI) * height))
		draw_polyline(arc, hop_colour, _tune("hop_thickness", 4.0))

## What is left, with what went still on the board.
func _draw_take_away() -> void:
	var total := _int("total")
	var gone := _int("gone")
	var kept := maxi(0, total - gone)
	var colours: Array = []
	for i in total:
		colours.append(_role("token_a", "owl") if i < kept else _role("token_gone", "text_dim"))
	var token := _tune("token_size", 26.0)
	var gap := _tune("token_gap", 9.0)
	var per_row := maxi(1, int((size.x - token) / (token + gap)))
	var rows: int = int(ceil(float(total) / float(per_row)))
	_fit(mini(total, per_row) * (token + gap), rows * (token + gap))
	_token_row(total, Vector2(size.x * 0.5, size.y * 0.5 - token * 0.5), colours)
	# Cross the taken ones after the row, so the geometry is computed once.
	for i in range(kept, total):
		var col := i % per_row
		var row := i / per_row
		var wide: int = mini(total - row * per_row, per_row)
		var row_w := wide * token + maxf(0.0, wide - 1) * gap
		var at := Vector2(size.x * 0.5 - row_w * 0.5 + col * (token + gap) + token * 0.5,
			size.y * 0.5 - token * 0.5 + row * (token + gap))
		_cross(at, token * 0.36)

## Two towers and their numerals, in the shape of the snap cubes a classroom
## compares with: squares stacked edge to edge, so the taller tower IS the
## greater number before a child reads either numeral.
##
## Drawn as one file, always. An earlier version wrapped a tall stack into
## columns to make it fit, which is exactly the wrong thing to do here -- five
## drawn as one-then-two-then-two is no longer taller than two, and the card's
## own words ("you can see which pile is taller") stopped being true.
##
## `ask` is what makes this safe to ask a question on. Without it the card is a
## statement, and the tower the card is ABOUT gets the highlight colour. With it
## the card is a question -- "more" or "fewer" -- and nothing is highlighted,
## because the highlight was the answer. Comparison lessons used to hand the
## guided try its own answer in colour; validate_math_concepts.mjs now requires
## `ask` on any balance card that asks, and forbids it on any card that does not.
func _draw_balance() -> void:
	var a := _int("a")
	var b := _int("b")
	var tallest: int = maxi(1, maxi(a, b))
	var numeral_size := _tune("numeral_font_size", 26.0)
	# The towers grow UP from a baseline, so without a top inset the tallest one
	# butts straight against whatever sits above the visual -- the progress dots,
	# as a screenshot showed. Taken from the same margin every other renderer
	# fits itself to, rather than a second number to keep in sync.
	var top_inset := _tune("fit_margin", 24.0) * 0.5
	var available := size.y - numeral_size * 1.6 - top_inset
	# Size the cube to the taller tower rather than clamping the count: both
	# towers stay single file at any height the card can be given.
	# Width is fixed and only the brick HEIGHT shrinks. Shrinking both turned a
	# fourteen-tall tower into a 6px thread: correct, and invisible.
	var brick_w := _tune("token_size", 26.0) * 0.9
	var brick_h: float = clampf(available / float(tallest), 4.0, brick_w)
	var base := top_inset + available
	var outline := _role("outline", "ink")
	var roles := ["token_a", "token_b"]
	var fallbacks := ["owl", "accent"]
	# A statement points at one tower; a question must point at neither. Two
	# equal towers also point at neither: colouring one side of an equality says
	# the opposite of what an equality card is for, and addition.both_sides opens
	# on exactly that picture.
	var ask := String(_params.get("ask", ""))
	var winner: int = -1
	if ask == "" and a != b:
		winner = 0 if a > b else 1
	for c in 2:
		var count: int = a if c == 0 else b
		var x := size.x * (0.35 if c == 0 else 0.65)
		var fill := _role(roles[c], fallbacks[c])
		for i in count:
			var cell := Rect2(Vector2(x - brick_w * 0.5, base - (i + 1) * brick_h), Vector2(brick_w, brick_h))
			draw_rect(cell, fill)
			# The seam between bricks only survives while the brick is taller
			# than the line; a very tall tower draws as one solid bar instead,
			# which still reads correctly.
			if brick_h > 5.0:
				draw_rect(cell, outline, false, 1.5)
		var colour := _role("highlight", "yes") if c == winner else _role("numeral", "paper")
		_numeral(str(count), Vector2(x, base + numeral_size * 0.7), numeral_size, colour)

## The repeating core, coloured by position within it. A pattern is only visible
## once the repeat is: the colours say "this one is the same as that one" before
## a child has read a single numeral.
func _draw_pattern_strip() -> void:
	var core: Array = _params.get("core", [])
	if core.is_empty():
		return
	var length := _int("length", 5)
	var chip := _tune("chip_size", 34.0)
	var gap := _tune("chip_gap", 10.0)
	var slots := length + 1
	var total_w := slots * chip + maxf(0.0, slots - 1) * gap
	_fit(total_w, chip)
	var y := size.y * 0.5
	var x := size.x * 0.5 - total_w * 0.5 + chip * 0.5
	var numeral_size := _tune("numeral_font_size", 26.0) * 0.8
	for i in slots:
		var at := Vector2(x + i * (chip + gap), y)
		var last := i == length
		var value: Variant = _params.get("reveal", null) if last else core[i % core.size()]
		var slot := i % core.size()
		if last and value == null:
			draw_arc(at, chip * 0.5, 0.0, TAU, 28, _role("mark", "accent"), 3.0)
			_numeral("?", at, numeral_size, _role("mark", "accent"))
			continue
		_pattern_chip(at, chip * 0.5, slot)
		_numeral(str(value), at, numeral_size, _role("outline", "ink"))

## One chip of a repeating pattern, marked by SHAPE first and colour second.
##
## Colour alone cannot do this job here, and that is measurable rather than a
## matter of taste: across the seven palettes there is no set of three roles that
## are all legible on the board AND distinguishable from each other. The only two
## that came close were `hurt` and `spike`, which are the damage colours. A
## previous fix swapped the third slot from `coin` to `primary` to stop it
## matching `accent` -- and made it near-invisible instead, 1.16:1 against the
## board in prism_hollow.
##
## Shape works in every theme by construction, and it is what a child who cannot
## separate the colours needs anyway. Colour stays, as reinforcement.
func _pattern_chip(at: Vector2, radius: float, slot: int) -> void:
	var fill := _role("token_a", "owl") if slot % 2 == 0 else _role("token_b", "accent")
	var edge := _role("outline", "ink")
	match slot % 3:
		0:
			draw_circle(at, radius, fill)
			draw_arc(at, radius, 0.0, TAU, 24, edge, 2.5)
		1:
			var box := Rect2(at - Vector2(radius, radius) * 0.9, Vector2(radius, radius) * 1.8)
			draw_rect(box, fill)
			draw_rect(box, edge, false, 2.5)
		_:
			# A diamond: the square turned, so the third slot reads as its own
			# thing at a glance without needing a new colour.
			var points := PackedVector2Array([
				at + Vector2(0, -radius), at + Vector2(radius, 0),
				at + Vector2(0, radius), at + Vector2(-radius, 0),
			])
			draw_colored_polygon(points, fill)
			var outline := points.duplicate()
			outline.append(points[0])
			draw_polyline(outline, edge, 2.5)

## A sequence as a child meets it in the pools: numbers, a comma, and a gap.
func _draw_numbers() -> void:
	var values: Array = _params.get("values", [])
	var numeral_size := _tune("numeral_font_size", 26.0) * 1.5
	var parts: PackedStringArray = PackedStringArray()
	for v: Variant in values:
		parts.append(str(v))
	parts.append(str(_params["reveal"]) if _params.has("reveal") else "?")
	var text := ", ".join(parts)
	var colour := _role("numeral", "paper")
	_numeral(text, Vector2(size.x * 0.5, size.y * 0.5), numeral_size, colour)
	# The unknown, or the answer, in the colour the rest is not.
	var tail: String = parts[parts.size() - 1]
	var font := _font()
	var full := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, int(numeral_size)).x
	var tail_w := font.get_string_size(tail, HORIZONTAL_ALIGNMENT_LEFT, -1, int(numeral_size)).x
	_numeral(tail, Vector2(size.x * 0.5 + full * 0.5 - tail_w * 0.5, size.y * 0.5), numeral_size,
		_role("highlight", "yes") if _params.has("reveal") else _role("mark", "accent"))

## Equal groups, ringed. Read left to right it is multiplication; read as "share
## these out fairly" it is division. Same picture, and saying so is the lesson.
## Scale the drawing to the band it has been given.
##
## Every renderer below computes its natural size from its own content and then
## centres it, and nothing used to bound that. Two things went wrong, both of
## them only visible in a screenshot:
##
##   too wide  -- six groups of seven drew straight past both edges of the board.
##   too small -- six berries in a row used a quarter of the band and the rest was
##                brown. The concrete picture is the pedagogical point of a `see`
##                card, and it was the least prominent thing on it.
##
## So this scales BOTH ways, bounded by width and height together so growing
## never pushes a picture out of its band, and capped so a two-token card does
## not become a billboard. The scale is applied about the centre through the draw
## transform, which means no renderer changes a single coordinate: a point p
## becomes c + s * (p - c).
##
## Scaling is uniform, so relative geometry survives it -- a ten-frame that grows
## is still five and five, which is the whole reason a ten-frame works.
func _fit(natural_w: float, natural_h: float) -> void:
	if natural_w <= 0.0 or natural_h <= 0.0:
		return
	var margin := _tune("fit_margin", 24.0)
	var s: float = minf((size.x - margin) / natural_w, (size.y - margin) / natural_h)
	s = clampf(s, _tune("fit_min_scale", 0.35), _tune("fit_max_scale", 1.6))
	if is_equal_approx(s, 1.0):
		return
	var c := size * 0.5
	draw_set_transform(c * (1.0 - s), 0.0, Vector2(s, s))

func _draw_groups() -> void:
	var count := _int("groups", 2)
	var each := _int("each", 2)
	var token := _tune("token_size", 26.0) * 0.8
	var gap := _tune("token_gap", 9.0) * 0.8
	var group_gap := _tune("group_gap", 24.0)
	# Rows of five, for the same reason the ten-frame is five and five: a group
	# of ten laid out four-four-two has to be counted, and one laid out five and
	# five is READ. A squarish sqrt block looked tidier and taught less.
	var columns: int = clampi(each, 1, FRAME_COLUMNS)
	var rows: int = maxi(1, int(ceil(float(each) / float(columns))))
	var ring_w := columns * (token + gap) + gap
	var ring_h := rows * (token + gap) + gap
	var total_w := count * ring_w + maxf(0.0, count - 1) * group_gap
	_fit(total_w, ring_h)
	var origin := Vector2(size.x * 0.5 - total_w * 0.5, size.y * 0.5 - ring_h * 0.5)
	var outline := _role("outline", "ink")
	for g in count:
		var gx := origin.x + g * (ring_w + group_gap)
		draw_rect(Rect2(Vector2(gx, origin.y), Vector2(ring_w, ring_h)), outline, false,
			_tune("group_ring_border", 3.0))
		for i in each:
			var at := Vector2(gx + gap + (i % columns) * (token + gap) + token * 0.5,
				origin.y + gap + (i / columns) * (token + gap) + token * 0.5)
			_token(at, token * 0.5, _role("token_a", "owl"))

## Rods and units. Twenty-four is two rods and four cubes, and a child who has
## seen that will never again read the 2 in 24 as a two.
func _draw_tens_and_ones() -> void:
	var tens := _int("tens")
	var ones := _int("ones")
	var add_tens := _int("addTens")
	var add_ones := _int("addOnes")
	var take_ones := _int("takeOnes")
	var rod_w := _tune("rod_width", 16.0)
	var rod_h := _tune("rod_height", 84.0)
	var rod_gap := _tune("rod_gap", 8.0)
	var unit := rod_w
	var total_rods := tens + add_tens
	var total_units := ones + add_ones
	var unit_columns: int = maxi(1, mini(total_units, 5))
	var units_w := unit_columns * (unit + rod_gap)
	var rods_w := total_rods * (rod_w + rod_gap)
	var total_w := rods_w + (rod_gap * 2.0 if total_rods > 0 and total_units > 0 else 0.0) + units_w
	_fit(total_w, rod_h)
	var top := size.y * 0.5 - rod_h * 0.5
	var x := size.x * 0.5 - total_w * 0.5
	var outline := _role("outline", "ink")

	for i in total_rods:
		var colour := _role("token_a", "owl") if i < tens else _role("token_b", "accent")
		var at := Rect2(Vector2(x + i * (rod_w + rod_gap), top), Vector2(rod_w, rod_h))
		draw_rect(at, colour)
		draw_rect(at, outline, false, 2.0)

	var ux := x + rods_w + (rod_gap * 2.0 if total_rods > 0 and total_units > 0 else 0.0)
	var kept := maxi(0, ones - take_ones)
	for i in total_units:
		var col := i % unit_columns
		var row := i / unit_columns
		var colour := _role("token_a", "owl")
		if i >= ones:
			colour = _role("token_b", "accent")
		elif i >= kept:
			colour = _role("token_gone", "text_dim")
		var cell := Rect2(Vector2(ux + col * (unit + rod_gap), top + row * (unit + rod_gap)), Vector2(unit, unit))
		draw_rect(cell, colour)
		draw_rect(cell, outline, false, 2.0)
		if i >= kept and i < ones:
			_cross(cell.get_center(), unit * 0.36)

## A whole, with one part known and one part hidden.
##
## The bar model, and the only honest picture of a missing addend: "5 + ? = 8"
## is not five things and then a mystery, it is EIGHT things of which five are
## visible. A child who has seen the whole drawn as one bar can count up inside
## it; a child shown two separate piles cannot, because one of the piles does not
## exist yet.
func _draw_part_whole() -> void:
	var total := _int("total")
	var known := _int("known")
	if total <= 0:
		return
	var gap := _tune("token_gap", 9.0) * 0.5
	var margin := _tune("token_size", 26.0)
	var span := maxf(1.0, size.x - margin * 2.0)
	var cell: float = minf(_tune("token_size", 26.0) * 1.4, (span - gap * (total - 1)) / float(total))
	var width := total * cell + gap * maxf(0.0, total - 1)
	var height := cell * 1.5
	var numeral_size := _tune("numeral_font_size", 26.0)

	# MEASURE THE WHOLE PICTURE, NOT JUST THE BAR.
	#
	# This card draws three things the bar's own rect does not contain: the whole
	# above it, the bracket line it hangs from, and the two part labels below. It
	# used to hand _fit() the bar alone -- so on any card where the bar was small
	# for its band, _fit scaled UP (to fit_max_scale, 1.6x) around the centre and
	# threw everything outside the bar clean out of the visual's 122px strip. On
	# addition.missing_part that put the "8" on top of the progress dots and the
	# "5" and the "?" through the body text underneath, which is what a screenshot
	# caught. Whatever _fit is given IS the picture as far as it is concerned.
	var natural := part_whole_natural_size(Vector2(width, height), numeral_size)
	var above := numeral_size * ABOVE_BAR
	_fit(natural.x, natural.y)

	# The ink is taller above the bar than below it, so centring the BAR would
	# leave the picture sitting low in its own band. Centre the whole extent and
	# put the bar where that leaves it.
	var origin := Vector2(size.x * 0.5 - width * 0.5, size.y * 0.5 - natural.y * 0.5 + above)
	var outline := _role("outline", "ink")

	for i in total:
		var at := Rect2(Vector2(origin.x + i * (cell + gap), origin.y), Vector2(cell, height))
		if i < known:
			draw_rect(at, _role("token_a", "owl"))
			draw_rect(at, outline, false, 2.0)
		else:
			# The hidden part is drawn as space that clearly EXISTS -- outlined,
			# not absent. It is the difference between "some are missing" and
			# "there is nothing there".
			draw_rect(at, outline, false, 2.0)

	# The whole, bracketed above; the known part labelled below it.
	var top := origin.y - numeral_size * 0.7
	draw_line(Vector2(origin.x, top), Vector2(origin.x + width, top), outline, 2.0)
	_numeral(str(total), Vector2(origin.x + width * 0.5, top - numeral_size * 0.55), numeral_size, _role("numeral", "paper"))
	if known > 0:
		var known_w := known * cell + gap * maxf(0.0, known - 1)
		_numeral(str(known), Vector2(origin.x + known_w * 0.5, origin.y + height + numeral_size * 0.7),
			numeral_size, _role("token_a", "owl"))
	if total > known:
		var rest_w := (total - known) * cell + gap * maxf(0.0, total - known - 1)
		_numeral("?", Vector2(origin.x + width - rest_w * 0.5, origin.y + height + numeral_size * 0.7),
			numeral_size, _role("mark", "accent"))

## The abstract form, last and largest. A result of null draws the question a
## child is about to be asked rather than its answer.
## The abstract form, last and largest. A missing `result` draws the question a
## child is about to be asked rather than its answer; a missing `b` puts the
## unknown INSIDE the sum; a missing `a` puts it FIRST, which is the only way to
## draw "? - 4 = 9" -- the start-unknown shape, and the hardest one a child in
## this band meets.
##
## `form: "total_first"` writes the whole before the equals -- "8 = 5 + 3". That
## is not a stylistic variant: it is the sentence a child has to be able to read
## before "=" can mean "the same amount as" rather than "compute now", and no
## other card in the pack shows it.
func _draw_equation() -> void:
	var size_px := _tune("equation_font_size", 46.0)
	var op := String(_params.get("op", "+"))
	var left := str(_params["a"]) if _params.has("a") else "?"
	var right := str(_params["b"]) if _params.has("b") else "?"
	var whole := str(_params["result"]) if _params.has("result") else "?"
	var text := "%s = %s %s %s" % [whole, left, op, right] if String(_params.get("form", "")) == "total_first" \
		else "%s %s %s = %s" % [left, op, right, whole]
	_numeral(text, Vector2(size.x * 0.5, size.y * 0.5), size_px, _role("numeral", "paper"))
