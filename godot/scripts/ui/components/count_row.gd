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

## How many things `text` asks the child to count, or 0 if it asks nothing of
## the sort. Static and text-only so the rule can be tested without a board.
##
## Deliberately strict: the tail after the final colon must be one symbol
## repeated, nothing else. A prompt that merely contains an asterisk, or ends in
## a number, or trails off into words, is left alone.
static func tokens_in(text: String) -> int:
	var colon := text.rfind(":")
	if colon < 0:
		return 0
	var tail := text.substr(colon + 1).strip_edges()
	if tail.is_empty():
		return 0
	var marker := ""
	var count := 0
	for c in tail:
		if c == " " or c == "\t":
			continue
		if marker == "":
			marker = c
		elif c != marker:
			return 0
		count += 1
	if marker == "":
		return 0
	# A symbol, or one of the few letters the curriculum actually uses as one.
	var is_symbol := not (marker.to_lower() >= "a" and marker.to_lower() <= "z") \
		and not (marker >= "0" and marker <= "9")
	if not is_symbol and not LETTER_MARKERS.has(marker):
		return 0
	return count

var _count := 0
var _texture: Texture2D = null

func setup(count: int) -> void:
	_count = maxi(0, count)
	_texture = SpriteSheet.texture(TOKEN_KEY) if SpriteSheet.has_art(TOKEN_KEY) else null
	var columns := mini(_count, PER_ROW)
	var rows := int(ceil(float(_count) / float(PER_ROW)))
	custom_minimum_size = Vector2(
		maxf(0.0, _column_x(maxi(0, columns - 1)) + TOKEN),
		maxf(0.0, rows * TOKEN + maxf(0.0, rows - 1) * GAP))
	queue_redraw()

## Left edge of a column, including the ten-frame's mid-row split.
static func _column_x(column: int) -> float:
	return column * (TOKEN + GAP) + (HALF_GAP if column >= HALF else 0.0)

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
		# A disc with a hard rim: countable at a glance, and distinct at every
		# size from the coin, which is a disc with a face on it.
		draw_circle(at, TOKEN * 0.44, fill)
		draw_arc(at, TOKEN * 0.44, 0, TAU, 32, edge, 3.0)
