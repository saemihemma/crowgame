extends Control
class_name PipRow
## A row of countable things you either have or do not: gold when you have one,
## an empty socket ringed in gold when you do not.
##
## One drawing, three places. The locked-door card uses it for the owls still in
## chains, the HUD uses it for this run's big coins, and the completion screen
## uses it for both. That is deliberate: a six-year-old should have to learn this
## shape ONCE and then read it everywhere. Two copies of it would drift into two
## dialects of the same sentence.
##
## RINGS, not two shades of dot. The first version of this blended the fill toward
## ink for an empty pip - which is what the HUD's owl ring does for its unlit
## track, and which works there because that track sits on an ink disc over a
## BRIGHT WORLD. On the ink locked-door card the same mix came out at rgb(95,84,73):
## mud, distinct from the card but reading as dead stones rather than as something
## still to find. So the outline is the constant and the fill is the variable.

const DOT := 16.0
const GAP := 12.0
const RING := 3.0
## The socket floor: dark, but lifted off whatever it sits on, so an empty pip is
## a hole in something rather than a hole in nothing.
const SOCKET_MIX := 0.86
## Padding inside the plate, when there is one.
const PLATE_PAD := 9.0

## How many there are, and how many you have.
var total := 3
var filled := 0
## Theme colour keys. Owls are pale owl-gold; big coins are coin gold, so the row
## reads as coins rather than as a second set of owls.
var ring_key := "owl"
var fill_key := "coin"
## An ink plate behind the row. Off on a card, which is already a plate; on in the
## HUD, where §8.6b says an element carries its own legibility rather than
## borrowing it from whatever world happens to be behind it.
var plate := false


static func make(count: int, have: int, ring: String = "owl", fill: String = "coin", with_plate: bool = false) -> PipRow:
	var row := PipRow.new()
	row.total = count
	row.filled = have
	row.ring_key = ring
	row.fill_key = fill
	row.plate = with_plate
	return row


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_resize()
	ThemeManager.theme_changed.connect(func(_id: String) -> void: queue_redraw())


## Change what the row shows. Resizes, because the number of pips is a property of
## the level rather than a constant -- a level holding two big coins must not draw
## three sockets and tell a child to look for one that is not there.
func set_counts(count: int, have: int) -> void:
	total = count
	filled = have
	_resize()
	queue_redraw()


func _resize() -> void:
	var n: int = maxi(1, total)
	var pad: float = PLATE_PAD if plate else 0.0
	custom_minimum_size = Vector2(
		n * DOT * 2.0 + (n - 1) * GAP + RING * 2.0 + pad * 2.0,
		DOT * 2.0 + RING * 2.0 + pad * 2.0)
	size = custom_minimum_size


func _draw() -> void:
	var ink := ThemeManager.get_color_value("ink")
	var ring := ThemeManager.get_color_value(ring_key)
	var fill := ThemeManager.get_color_value(fill_key)
	var socket := ring.lerp(ink, SOCKET_MIX)
	var pad: float = PLATE_PAD if plate else 0.0

	if plate:
		var r := Rect2(Vector2.ZERO, size)
		draw_style_box(_plate_face(ink), r)

	var y := size.y * 0.5
	for i in maxi(1, total):
		var x := pad + DOT + RING + i * (DOT * 2.0 + GAP)
		var lit := i < filled
		draw_circle(Vector2(x, y), DOT, fill if lit else socket)
		# The outline is on every pip, lit or not. It is what says "one belongs
		# here", and having it is simply the same circle filled in.
		draw_arc(Vector2(x, y), DOT - RING * 0.5, 0, TAU, 28,
			fill if lit else Color(ring, 0.8), RING)


func _plate_face(ink: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(ink, 0.82)
	box.set_corner_radius_all(int(DOT + RING))
	box.set_border_width_all(2)
	box.border_color = Color(ThemeManager.get_color_value("paper"), 0.45)
	return box
