extends Control
class_name FitBox
## Centres one card and shrinks it when the viewport is too small to hold it.
##
## WHY THIS EXISTS
## ---------------
## `stretch/aspect=expand` (project.godot) guarantees the viewport is never
## smaller than the base 960x540 - but on any display at 16:9 or wider it is
## EXACTLY 540 tall, because expand grows the roomier axis and leaves the other
## at the base. Every full-screen menu here is a centred column of Gate-B3
## buttons (88px floor) under a large title, and that column is taller than 540:
## the pause card lost its Quit row and the main menu lost the umlauts off
## HÖRMANN on every desktop screen. On the owner's iPad the same column fits with
## room to spare, which is why it shipped.
##
## Scale, not scroll. A seven-year-old should never have to discover that a pause
## menu scrolls; a list that GROWS with content (the profile list, the world row)
## is a different problem and stays in a ScrollContainer. Here the content is
## fixed and known, so the honest fix is to make it fit. Scale is clamped at 1.0,
## so nothing is ever blown up - this only ever engages to rescue a screen that
## would otherwise be cut.
##
## Centring is done here rather than by a CenterContainer because a container
## positions its child from the child's UNSCALED size, so a scaled card would sit
## off-centre by half the pixels it saved.

## Breathing room kept outside the card at any size. Rounded display corners and
## the language chips both live in that band.
const MARGIN := 16.0

var _card: Control

## Wrap `card` in a full-rect fitter. The caller adds the fitter, not the card.
static func around(card: Control) -> FitBox:
	var box := FitBox.new()
	box.set_anchors_preset(Control.PRESET_FULL_RECT)
	# The fitter is a positioning device, not a surface: it must not swallow a
	# tap meant for the level behind an overlay that does not cover it.
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box._card = card
	box.add_child(card)
	return box

func _ready() -> void:
	resized.connect(_fit)
	# minimum_size_changed, NOT resized: _fit sets the card's size, and a card
	# listening to its own resize would call _fit from inside _fit forever.
	_card.minimum_size_changed.connect(_fit)
	_fit.call_deferred()

func _fit() -> void:
	fit_for(size)


## Lay the card out against an arbitrary viewport.
##
## Public for the same reason TouchControls.layout_for is: the sizes that break
## this are the ones the test runner does not happen to be. The tightest viewport
## this game can be given is exactly 960x540 - `expand` grows the roomier axis
## and leaves the other at the base - and that is the one nobody was checking.
func fit_for(view: Vector2) -> void:
	if not is_instance_valid(_card):
		return
	var need := _card.get_combined_minimum_size()
	if need.x <= 0.0 or need.y <= 0.0:
		return
	_card.size = need
	var factor := scale_for(need, view)
	_card.scale = Vector2(factor, factor)
	_card.position = (view - need * factor) * 0.5


## How much a card of size `need` has to shrink to sit inside `view`, margin
## included. Never above 1.0: this rescues screens, it does not magnify them.
static func scale_for(need: Vector2, view: Vector2) -> float:
	if need.x <= 0.0 or need.y <= 0.0:
		return 1.0
	var room := view - Vector2(MARGIN, MARGIN) * 2.0
	return minf(1.0, minf(room.x / need.x, room.y / need.y))

## How much the card had to give up to fit, for the gate tests. 1.0 means it fit.
func fit_scale() -> float:
	return _card.scale.x if is_instance_valid(_card) else 1.0

## The card's rect in this fitter's space, scale included.
func card_rect() -> Rect2:
	if not is_instance_valid(_card):
		return Rect2()
	return Rect2(_card.position, _card.get_combined_minimum_size() * _card.scale)
