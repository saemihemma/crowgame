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

## SIX TOKEN SHAPES, and which one a prompt gets.
##
## The curriculum cycles through twelve symbols to write its counting prompts
## (? o * # + x @ % & ^ $ !) and this renderer used to collapse every one of them
## to a single sprite -- so all 123 counting problems looked identical, and the
## twelve-way variety the authors had encoded was thrown away one layer before
## the child. A playtester put it as "we need more variety of symbols as well,
## not just a circle with a plus in it".
##
## That sprite was also, literally, a plus sign inside a circle: the worst
## available choice for a countable object in a maths game, where a child has
## just been taught that "+" means put together. Six drawn shapes replace it.
##
## Shape follows the prompt's own symbol, so a given problem always looks the
## same -- a child who meets it again meets the same picture, and a screenshot is
## reproducible. Deliberately not random per render.
const SHAPES := ["disc", "ring", "square", "diamond", "leaf", "flower"]

## Which shape a marker draws as. Unmapped symbols hash into the set rather than
## falling back to one default, so a thirteenth symbol appearing in the
## curriculum gets variety for free instead of quietly becoming a disc.
const SHAPE_BY_MARKER := {
	"o": "disc", "O": "disc",
	"*": "flower", "^": "flower",
	"#": "square", "$": "square",
	"x": "diamond", "X": "diamond", "%": "diamond",
	"&": "leaf", "@": "leaf",
	"?": "ring", "!": "ring",
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

## Deliberately strict: the tail after the final colon must be one symbol
## repeated, nothing else. A prompt that merely contains an asterisk, or ends in
## a number, or trails off into words, is left alone.
static func _parse(text: String) -> Array:
	var colon := text.rfind(":")
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
func _draw_shape(shape: String, at: Vector2, radius: float, fill: Color, edge: Color) -> void:
	const RIM := 3.0
	match shape:
		"ring":
			draw_arc(at, radius * 0.78, 0, TAU, 32, fill, radius * 0.42)
			draw_arc(at, radius, 0, TAU, 32, edge, RIM)
		"square":
			var box := Rect2(at - Vector2(radius, radius) * 0.86, Vector2(radius, radius) * 1.72)
			draw_rect(box, fill)
			draw_rect(box, edge, false, RIM)
		"diamond":
			var d := PackedVector2Array([
				at + Vector2(0, -radius), at + Vector2(radius, 0),
				at + Vector2(0, radius), at + Vector2(-radius, 0)])
			draw_colored_polygon(d, fill)
			draw_polyline(_closed(d), edge, RIM)
		"leaf":
			# Two arcs meeting at a point top and bottom: a leaf rather than an
			# ellipse, so it does not read as a squashed disc at token size.
			var leaf := PackedVector2Array()
			for i in 13:
				var t := float(i) / 12.0
				leaf.append(at + Vector2(sin(t * PI) * radius * 0.62, (t * 2.0 - 1.0) * radius))
			for i in 13:
				var t := float(i) / 12.0
				leaf.append(at + Vector2(-sin((1.0 - t) * PI) * radius * 0.62, ((1.0 - t) * 2.0 - 1.0) * radius))
			draw_colored_polygon(leaf, fill)
			draw_polyline(_closed(leaf), edge, RIM)
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

## A polyline needs its first point repeated to close; a polygon does not.
static func _closed(points: PackedVector2Array) -> PackedVector2Array:
	var out := PackedVector2Array(points)
	if out.size() > 0:
		out.append(out[0])
	return out
