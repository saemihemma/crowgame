extends CanvasLayer
## TouchControls — the on-screen gamepad.
##
## Each pad is a TouchScreenButton bound to an InputMap action, so touch drives
## exactly the same actions player.gd reads. No separate input path.
##
## Two things were wrong with the port this replaces, and both were structural:
##
## 1. It laid itself out from ProjectSettings' 960x540 rather than from the
##    viewport it was actually in. The moment the viewport stopped being 960x540
##    - which is the whole point of Phase 1 - the buttons detached from the
##    corners and floated in the middle of the screen.
## 2. Three of the five carried their meaning in a word. See TouchPad.
##
## brand/BRAND_SYSTEM.md §8.1, §12. Gates B3 (88px targets), B4 (32px safe
## area) and B10 (thumb reach) in brand/BRAND_SYSTEM.md §14.

## Gate B4: nothing interactive inside 32px of the edge, which is where rounded
## corners, gesture bars and the meat of a gripping hand are.
@onready var MARGIN: float = float(Config.ui("touch/safe_margin", 32))
@onready var GAP: float = float(Config.ui("touch/gap", 14))
## Gate B3 floor. Jump is larger because it is the action pressed most often and
## the one pressed in a hurry.
@onready var BTN: float = float(Config.ui("touch/button_size", 92))
@onready var JUMP_BTN: float = float(Config.ui("touch/jump_button_size", 112))

var _pads: Array[TouchPad] = []

func _ready() -> void:
	layer = 8
	# Hide on non-touch desktop to avoid clutter (keyboard still works).
	if not (DisplayServer.is_touchscreen_available() or OS.has_feature("web") or OS.has_feature("mobile")):
		visible = false
	_build()
	# The viewport is `expand` now, so its size depends on the device's aspect
	# and can change on rotation or a resized window. Re-laying out beats
	# rebuilding: rebuilding destroys live TouchScreenButtons and drops a press
	# the player is holding at that moment.
	get_viewport().size_changed.connect(_layout)

func _build() -> void:
	_pads.clear()
	_pads.append(TouchPad.make("move_left", TouchPad.Icon.LEFT, Vector2.ZERO, BTN))
	_pads.append(TouchPad.make("move_right", TouchPad.Icon.RIGHT, Vector2.ZERO, BTN))
	_pads.append(TouchPad.make("shoot", TouchPad.Icon.ZAP, Vector2.ZERO, BTN))
	_pads.append(TouchPad.make("interact", TouchPad.Icon.PECK, Vector2.ZERO, BTN))
	_pads.append(TouchPad.make("jump", TouchPad.Icon.JUMP, Vector2.ZERO, JUMP_BTN))
	for pad in _pads:
		add_child(pad)
	_layout()

## Positions come from the live viewport rect, every time.
func _layout() -> void:
	layout_for(get_viewport().get_visible_rect().size)

## Lay out against an arbitrary viewport size.
##
## Public so the gate tests can check B3, B4 and B10 at every aspect this game
## supports rather than only at whatever size the test runner happens to use -
## and it is the aspects that differ that broke this in the first place.
func layout_for(view: Vector2) -> void:
	if _pads.size() < 5:
		return
	var floor_y := view.y - MARGIN

	# Left thumb: the two directions, side by side in the corner.
	_pads[0].position = Vector2(MARGIN, floor_y - BTN)
	_pads[1].position = Vector2(MARGIN + BTN + GAP, floor_y - BTN)

	# Right thumb: jump in the corner where the thumb rests, with zap beside it
	# and peck above - the two used less often are the two further to reach.
	var jump_x := view.x - MARGIN - JUMP_BTN
	_pads[4].position = Vector2(jump_x, floor_y - JUMP_BTN)
	var stack_x := jump_x - GAP - BTN
	_pads[2].position = Vector2(stack_x, floor_y - BTN)
	_pads[3].position = Vector2(stack_x, floor_y - BTN - GAP - BTN)
	for pad in _pads:
		pad.queue_redraw()

## Every pad's rect in viewport space, for the gates.
func pad_rects() -> Array[Rect2]:
	var out: Array[Rect2] = []
	for pad in _pads:
		out.append(Rect2(pad.position, (pad.shape as RectangleShape2D).size))
	return out
