extends Control
class_name CountRow
## A row of countable tokens for counting problems.
##
## The curriculum has 79 problems whose skill is literally "counting_objects"
## and whose prompt rendered as "Count the marks: * * * * * *" — asterisks, in a
## text label. A child who can already read a row of asterisks as six things has
## nothing left to learn from the question; a child who cannot is being tested on
## typography. Objects are the medium the skill is about.
##
## Tokens are drawn rather than borrowed from the coin sprite on purpose: a coin
## means currency everywhere else in the game, and six coins on the board would
## read as a reward. Drop the file the registry names for TOKEN_KEY and it is used, with no
## change here (brand/ASSET_MANIFEST.md P1).

## The curriculum writes a counting prompt as a caption, a colon, then a run of
## one repeated symbol - and cycles through twelve different symbols to do it
## (? o * # + x @ % & ^ $ !), which is a placeholder convention, not a design.
## Letters are listed explicitly because a bare "o" or "x" is a plausible symbol
## but most letters are just prose.
const LETTER_MARKERS := ["o", "x", "O", "X"]

const TOKEN_KEY := "board_count_token"
## Matches the 32x32 source exactly: a pixel-art token drawn at 34 is resampled,
## and a counting object with soft edges is the one thing this must not be.
const TOKEN := 32.0
const GAP := 11.0
## The ten-frame's centre split. Five-and-five is what lets a child see eight as
## "five and three" instead of counting to eight every time.
const HALF_GAP := 14.0
## Ten per row, split five and five: a ten-frame, which is the representation
## primary maths actually teaches counting with. Rows of eight were arbitrary and
## made nineteen tokens something a child could only count one at a time; in tens
## it reads as a full ten and nine. Counts reach nineteen, so the wrap is
## load-bearing, not a safety net.
const PER_ROW := 10
const HALF := 5

## TWELVE TOKEN SHAPES, and which one a prompt gets.
##
## The curriculum writes its counting prompts with a repeated marker symbol, and
## this renderer used to collapse every one of them to a single sprite -- so all
## 123 counting problems looked identical. A playtester put it as "we need more
## variety of symbols as well, not just a circle with a plus in it".
##
## That sprite was also, literally, a plus sign inside a circle: the worst
## available choice for a countable object in a maths game, where a child has
## just been taught that "+" means put together. Drawn shapes replace it.
##
## Six became twelve because six is not enough at the BOTTOM of the ladder. A
## marker used to be pinned to one count range in the authoring templates (o was
## always 1-4, * always 5-8), so a five-year-old counting one to four met exactly
## one shape, forever, and the shape itself leaked the size of the answer. The
## templates now draw from the whole marker alphabet at every count, which only
## buys variety if the alphabet is wide enough to keep two neighbouring questions
## looking different: twelve shapes over four counts, not one.
##
## Shape follows the prompt's own symbol, so a given problem always looks the
## same -- a child who meets it again meets the same picture, and a screenshot is
## reproducible. Deliberately not random per render.
const SHAPES := [
	"disc", "ring", "square", "diamond", "leaf", "flower",
	"star", "triangle", "hexagon", "heart", "egg", "crescent",
]

## Which shape a marker draws as. Unmapped symbols hash into the set rather than
## falling back to one default, so a new symbol appearing in the curriculum gets
## variety for free instead of quietly becoming a disc.
##
## The marker never reaches the child -- the row it labels is replaced by drawn
## objects -- so these characters are an internal shape selector, not typography.
## That is why the alphabet can afford ")" and ";": nobody reads them.
const SHAPE_BY_MARKER := {
	"o": "disc", "O": "disc",
	"@": "ring", "?": "ring",
	"#": "square", "$": "square",
	"%": "diamond", "x": "diamond", "X": "diamond",
	"&": "leaf",
	"*": "flower",
	"^": "star",
	"<": "triangle", ">": "triangle",
	"~": "hexagon",
	";": "heart",
	"(": "egg", "!": "egg",
	")": "crescent",
	# "+" maps anywhere EXCEPT a plus-shaped token. See the note above.
	"+": "disc",
}

static func shape_for(marker: String) -> String:
	if marker == "":
		return SHAPES[0]
	if SHAPE_BY_MARKER.has(marker):
		return String(SHAPE_BY_MARKER[marker])
	return SHAPES[absi(marker.hash()) % SHAPES.size()]

## The symbol the prompt repeated, or "" if it asks nothing countable. The other
## half of the same parse: the COUNT says how many tokens to draw, the MARKER
## says which kind.
static func marker_in(text: String) -> String:
	return String(_parse(text)[0])

## How many things `text` asks the child to count, or 0 if it asks nothing of
## the sort. Static and text-only so the rule can be tested without a board.
static func tokens_in(text: String) -> int:
	return int(_parse(text)[1])

## The question without its marker run -- what the label should say once the row
## itself is drawn underneath. Keeps the caption's own punctuation, so
## "How many stars? * * *" reads "How many stars?" and not "How many stars".
## Returns the whole text unchanged when there is nothing countable in it.
static func caption_in(text: String) -> String:
	if int(_parse(text)[1]) <= 0:
		return text
	var cut := _separator(text)
	if cut < 0:
		return text
	# A colon is punctuation the caption does not need once the row replaces the
	# list it introduced; a question mark is part of the question.
	return text.substr(0, cut if text[cut] == ":" else cut + 1).strip_edges()

## Where the caption stops and the marker run begins.
##
## The colon is the curriculum's own convention and wins whenever there is one --
## which matters, because "?" is itself a marker ("How many are here: ? ? ?") and
## searching for the last "?" in that prompt would land past the run and find
## nothing. A question mark is only a separator for the captions that have no
## colon at all: "How many stars? * * * * *" in the easy pool, and the Icelandic
## translations of it, which used to render the asterisks as literal text --
## exactly the typography this file exists to remove.
static func _separator(text: String) -> int:
	var colon := text.rfind(":")
	if colon >= 0:
		return colon
	return text.rfind("?")

## Deliberately strict: the tail after the caption's final colon (or, failing
## that, its question mark) must be one symbol repeated, nothing else. A prompt
## that merely contains an asterisk, or ends in a number, or trails off into
## words, is left alone.
static func _parse(text: String) -> Array:
	var colon := _separator(text)
	if colon < 0:
		return ["", 0]
	var tail := text.substr(colon + 1).strip_edges()
	if tail.is_empty():
		return ["", 0]
	var marker := ""
	var count := 0
	for c in tail:
		if c == " " or c == "\t":
			continue
		if marker == "":
			marker = c
		elif c != marker:
			return ["", 0]
		count += 1
	if marker == "":
		return ["", 0]
	# A symbol, or one of the few letters the curriculum actually uses as one.
	var is_symbol := not (marker.to_lower() >= "a" and marker.to_lower() <= "z") \
		and not (marker >= "0" and marker <= "9")
	if not is_symbol and not LETTER_MARKERS.has(marker):
		return ["", 0]
	return [marker, count]

var _count := 0
var _shape := "disc"
var _texture: Texture2D = null

## `marker` is the prompt's own repeated symbol, from marker_in(). Optional so
## the older one-argument call still means "the default shape".
func setup(count: int, marker: String = "") -> void:
	_count = maxi(0, count)
	_shape = shape_for(marker)
	# Per-SHAPE art, not one token for everything: the seam that used to serve a
	# single count-token-32.png is the reason all six looked the same. A file
	# registered as board_count_token_leaf is used for leaves and nothing else, so
	# art can arrive one shape at a time (brand/ASSET_MANIFEST.md P1).
	var key := "%s_%s" % [TOKEN_KEY, _shape]
	_texture = SpriteSheet.texture(key) if SpriteSheet.has_art(key) else null
	var columns := mini(_count, PER_ROW)
	var rows := int(ceil(float(_count) / float(PER_ROW)))
	custom_minimum_size = Vector2(
		maxf(0.0, _column_x(maxi(0, columns - 1)) + TOKEN),
		maxf(0.0, rows * TOKEN + maxf(0.0, rows - 1) * GAP))
	queue_redraw()

## Left edge of a column, including the ten-frame's mid-row split.
##
## The split is what makes this a ten-frame rather than a line of ten, and it is
## the whole reason a child can read eight as "five and three" instead of counting
## to eight. Behind math/group_tokens_in_fives so the difference can be felt:
## with it off the row is unbroken, which is what a line of marks in a text label
## always was.
static func _column_x(column: int) -> float:
	var split := HALF_GAP if bool(Config.flag("math/group_tokens_in_fives", true)) else 0.0
	return column * (TOKEN + GAP) + (split if column >= HALF else 0.0)

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	ThemeManager.theme_changed.connect(func(_id): queue_redraw())

func _draw() -> void:
	# Owl-yellow on the board's dark face: the same colour the ring uses for a
	# rescued owl, so "things to count" and "things you are counting toward"
	# stay one family.
	var fill := ThemeManager.get_color_value("owl")
	var edge := ThemeManager.get_color_value("ink")
	for i in _count:
		var col := i % PER_ROW
		var row := i / PER_ROW
		var at := Vector2(_column_x(col) + TOKEN * 0.5, row * (TOKEN + GAP) + TOKEN * 0.5)
		if _texture != null:
			draw_texture_rect(_texture, Rect2(at - Vector2(TOKEN, TOKEN) * 0.5, Vector2(TOKEN, TOKEN)), false)
			continue
		_draw_shape(_shape, at, TOKEN * 0.44, fill, edge)

## One countable object. Every shape is drawn to the same radius and carries the
## same hard rim, so a row of any of them reads as one row of one kind of thing
## and none is visually heavier than the rest -- the variety is meant to
## distinguish PROBLEMS from each other, never one token from its neighbours.
##
## All six stay clearly distinct from the coin, which is a disc with a face on
## it: a countable object that reads as currency would make a counting question
## look like a reward.

## The crescent's sweep, and how deep the moon is bitten into it. Named rather
## than inlined so the shape can be retuned without anybody having to re-derive
## why two overlapping circles cannot be used for it.
const SWEEP_STEPS := 16
const CRESCENT_FROM := PI * 0.36
const CRESCENT_TO := PI * 1.64
const CRESCENT_BITE := 0.55

func _draw_shape(shape: String, at: Vector2, radius: float, fill: Color, edge: Color) -> void:
	const RIM := 3.0
	# The polygon shapes all come from one place, so a test can ask for the same
	# outline the renderer is about to fill -- see outline_for.
	var outline := outline_for(shape, at, radius)
	if not outline.is_empty():
		_fill(outline, fill, edge)
		return
	match shape:
		"ring":
			draw_arc(at, radius * 0.78, 0, TAU, 32, fill, radius * 0.42)
			draw_arc(at, radius, 0, TAU, 32, edge, RIM)
		"square":
			var box := Rect2(at - Vector2(radius, radius) * 0.86, Vector2(radius, radius) * 1.72)
			draw_rect(box, fill)
			draw_rect(box, edge, false, RIM)
		"flower":
			for i in 5:
				var a := TAU * float(i) / 5.0 - PI * 0.5
				draw_circle(at + Vector2(cos(a), sin(a)) * radius * 0.52, radius * 0.46, fill)
			draw_circle(at, radius * 0.42, edge)
		_:
			# "disc": a disc with a hard rim. Countable at a glance and the
			# baseline every other shape is calibrated against.
			draw_circle(at, radius, fill)
			draw_arc(at, radius, 0, TAU, 32, edge, RIM)

## The OUTLINE of a token, for the shapes that are polygons. Empty for the ones
## drawn from primitives -- a ring, a square, a flower and a disc have no
## polygon to get wrong.
##
## Split out of the drawing so the geometry has exactly one definition. The
## crescent shipped as two overlapping circles whose outline crossed itself,
## which is the one thing Geometry2D.triangulate_polygon refuses; nothing could
## have caught it while the points existed only inside a _draw call, because a
## test cannot see the inside of _draw. Now a test asks for the same outline the
## renderer is about to fill.
static func outline_for(shape: String, at: Vector2, radius: float) -> PackedVector2Array:
	var points := PackedVector2Array()
	match shape:
		"diamond":
			points = PackedVector2Array([
				at + Vector2(0, -radius), at + Vector2(radius, 0),
				at + Vector2(0, radius), at + Vector2(-radius, 0)])
		"leaf":
			# Two arcs meeting at a point top and bottom: a leaf rather than an
			# ellipse, so it does not read as a squashed disc at token size.
			for i in 13:
				var t := float(i) / 12.0
				points.append(at + Vector2(sin(t * PI) * radius * 0.62, (t * 2.0 - 1.0) * radius))
			for i in 13:
				var t := float(i) / 12.0
				points.append(at + Vector2(-sin((1.0 - t) * PI) * radius * 0.62, ((1.0 - t) * 2.0 - 1.0) * radius))
		"star":
			# Five points, alternating full and inner radius. Concave, so it goes
			# through _fill rather than draw_colored_polygon directly.
			for i in 10:
				var a := TAU * float(i) / 10.0 - PI * 0.5
				var r := radius if i % 2 == 0 else radius * 0.46
				points.append(at + Vector2(cos(a), sin(a)) * r)
		"triangle":
			for i in 3:
				var a := TAU * float(i) / 3.0 - PI * 0.5
				points.append(at + Vector2(cos(a), sin(a)) * radius)
		"hexagon":
			for i in 6:
				var a := TAU * float(i) / 6.0 - PI * 0.5
				points.append(at + Vector2(cos(a), sin(a)) * radius)
		"heart":
			# The standard heart curve, sampled. Scaled so the widest span matches
			# the shared token radius: every shape has to read as the same size.
			for i in 25:
				var t := TAU * float(i) / 24.0
				var hx := pow(sin(t), 3.0) * 16.0
				var hy := 13.0 * cos(t) - 5.0 * cos(2.0 * t) - 2.0 * cos(3.0 * t) - cos(4.0 * t)
				points.append(at + Vector2(hx, -hy) * radius / 16.0)
		"egg":
			# An oval that narrows toward the top, so it is not read as a squashed
			# disc -- and the game's own word problems are about eggs in nests.
			for i in 24:
				var t := TAU * float(i) / 24.0
				var width := radius * 0.72 * (1.0 - 0.20 * cos(t))
				points.append(at + Vector2(sin(t) * width, -cos(t) * radius))
		"crescent":
			# Outer arc down one side, and an inner edge that RETURNS ALONG THE
			# SAME ANGLES at a radius which dips inward and comes back to
			# `radius` at both ends. So the outline closes on itself exactly, by
			# construction, at every size.
			#
			# It used to be two circles: the outer one, and an inner arc on a
			# centre shifted by 0.46r with radius 0.94r. Those two circles
			# INTERSECT, so the outline crossed itself -- and a self-intersecting
			# polygon is the one thing triangulate_polygon returns nothing for.
			# _fill then fell through to draw_colored_polygon, which is the exact
			# call that cannot draw a concave shape, and the engine printed
			# "Invalid polygon data, triangulation failed" fourteen times in one
			# owl encounter. Every test still passed: the suite fails on engine
			# errors too, which is the only reason anybody found out.
			for i in SWEEP_STEPS + 1:
				var s := float(i) / float(SWEEP_STEPS)
				var t := lerpf(CRESCENT_FROM, CRESCENT_TO, s)
				points.append(at + Vector2(sin(t), -cos(t)) * radius)
			for i in SWEEP_STEPS + 1:
				var s := 1.0 - float(i) / float(SWEEP_STEPS)
				var t := lerpf(CRESCENT_FROM, CRESCENT_TO, s)
				# sin() is zero at both ends, so the inner edge meets the outer
				# arc exactly where it must and bites deepest in the middle.
				var dip := radius * (1.0 - CRESCENT_BITE * sin(PI * s))
				points.append(at + Vector2(sin(t), -cos(t)) * dip)
	return points

## Fill a possibly concave outline, then rim it.
##
## draw_colored_polygon only draws a convex polygon correctly, and the star, the
## heart and the crescent are all concave -- drawn straight they come out as a
## smeared fan. Triangulating first is the difference between a star and a
## mistake. If the triangulator refuses the outline we still draw something
## rather than nothing, because a missing token means a child counts the wrong
## number.
func _fill(points: PackedVector2Array, fill: Color, edge: Color) -> void:
	const RIM := 3.0
	var indices := Geometry2D.triangulate_polygon(points)
	if indices.size() >= 3:
		var i := 0
		while i + 2 < indices.size():
			draw_colored_polygon(PackedVector2Array([
				points[indices[i]], points[indices[i + 1]], points[indices[i + 2]]]), fill)
			i += 3
	else:
		_fan(points, fill)
	draw_polyline(_closed(points), edge, RIM)

## The fallback, when the triangulator refuses an outline: a fan of triangles
## from the centroid.
##
## This used to be `draw_colored_polygon(points, fill)`, which is not a fallback
## at all -- it is the same call the four lines above exist to avoid, and the
## only outlines that reach here are the concave ones it cannot draw. So the
## "we still draw something rather than nothing" promise in the comment above was
## backwards: it drew nothing AND logged an engine error, once per token per
## frame. The crescent did exactly that until the shape itself was fixed.
##
## Every triangle here is convex by construction, so this can never fail. For an
## outline that is star-shaped about its centroid -- which every token in this
## file is -- the fan is also exactly right rather than an approximation.
func _fan(points: PackedVector2Array, fill: Color) -> void:
	for tri in fan_triangles(points):
		draw_colored_polygon(tri, fill)

## The fan itself, as data, so a test can check the geometry without a viewport.
## Every triangle is convex by construction, which is the whole property that
## makes this a safe fallback.
static func fan_triangles(points: PackedVector2Array) -> Array[PackedVector2Array]:
	var out: Array[PackedVector2Array] = []
	if points.size() < 3:
		return out
	var centre := Vector2.ZERO
	for p in points:
		centre += p
	centre /= float(points.size())
	for i in points.size():
		out.append(PackedVector2Array([centre, points[i], points[(i + 1) % points.size()]]))
	return out

## A polyline needs its first point repeated to close; a polygon does not.
static func _closed(points: PackedVector2Array) -> PackedVector2Array:
	var out := PackedVector2Array(points)
	if out.size() > 0:
		out.append(out[0])
	return out
