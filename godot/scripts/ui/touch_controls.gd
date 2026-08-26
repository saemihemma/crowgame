extends CanvasLayer
class_name TouchControls
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
## There were five. The fifth was `interact`, drawn as Hörmann pecking, and it
## did nothing: no script has ever read that action. Owl encounters fire on
## proximity - Npc._on_body_entered calls interact() when the player enters the
## zone, and _process re-offers on a cooldown while they stand there - so the
## button was a 92px target in the thumb corner, wearing the game's own mascot,
## that pressed and lit up and led nowhere. Two tests asserted the action into
## the InputMap without ever checking that something read it, which is how it
## stayed green for as long as it did. If interaction ever needs a button, the
## proximity trigger has to come out at the same time; a control that duplicates
## something the game already does for you is the same bug again.
##
## THE FIFTH SLOT IS SPRINT NOW, and it is the opposite case: an action player.gd
## really reads, on a key a touch device does not have. Sprint is a default
## capability that nothing teaches, so on an iPad it was unreachable rather than
## undiscovered - the run-width gaps in levels 6 and 8 have a walk route only
## because the reachability guard insists on one.
##
## It sits NEXT TO JUMP, the way B sits next to A, so one thumb can cover both or
## leave sprint for the instant it takes to press jump -- see layout_for. It is
## momentary for the same reason; TouchPad.make_latching is still there behind
## input/sprint_pad_latches for a child who cannot manage the roll.
##
## And it is built only when input/space_is_sprint is on. A pad for an action the
## flag has switched off would press and light up and lead nowhere, which is the
## peck button again with a different icon.
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
## By action, because the sprint pad is conditional and index-based layout breaks
## silently the moment a pad is not built.
var _by_action: Dictionary = {}


## Does this machine have a finger to press these with?
##
## It used to be `is_touchscreen_available() or has_feature("web") or
## has_feature("mobile")`, and the middle term is why the owner got a five-button
## thumb gamepad laid over the level on a desktop PC: every web export is
## "web", including the one running in a browser on a laptop. There is no such
## thing as a web device class - the browser knows whether it has a touchscreen,
## and Godot asks it.
##
## This is only honest with `input_devices/pointing/emulate_touch_from_mouse` off
## (project.godot): that setting makes the engine answer yes on any machine with
## a mouse, which is exactly the answer that was wrong.
static func supported() -> bool:
	return DisplayServer.is_touchscreen_available() or OS.has_feature("mobile")


func _ready() -> void:
	layer = 8
	if not supported():
		visible = false
	_build()
	# The viewport is `expand` now, so its size depends on the device's aspect
	# and can change on rotation or a resized window. Re-laying out beats
	# rebuilding: rebuilding destroys live TouchScreenButtons and drops a press
	# the player is holding at that moment.
	get_viewport().size_changed.connect(_layout)

func _build() -> void:
	_pads.clear()
	_by_action.clear()
	_add(TouchPad.make("move_left", TouchPad.Icon.LEFT, Vector2.ZERO, BTN))
	_add(TouchPad.make("move_right", TouchPad.Icon.RIGHT, Vector2.ZERO, BTN))
	if bool(Config.flag("input/space_is_sprint", true)):
		var latches := bool(Config.flag("input/sprint_pad_latches", true))
		_add(TouchPad.make_latching("sprint", TouchPad.Icon.SPRINT, Vector2.ZERO, BTN) if latches
			else TouchPad.make("sprint", TouchPad.Icon.SPRINT, Vector2.ZERO, BTN))
	_add(TouchPad.make("shoot", TouchPad.Icon.ZAP, Vector2.ZERO, BTN))
	_add(TouchPad.make("jump", TouchPad.Icon.JUMP, Vector2.ZERO, JUMP_BTN))
	for pad in _pads:
		add_child(pad)
	_layout()

func _add(pad: TouchPad) -> void:
	_pads.append(pad)
	_by_action[pad.pad_action()] = pad

## The pad driving `action`, or null when it was not built.
func pad_for(action: String) -> TouchPad:
	return _by_action.get(action, null)

## Positions come from the live viewport rect, every time.
func _layout() -> void:
	layout_for(get_viewport().get_visible_rect().size)

## Lay out against an arbitrary viewport size.
##
## Public so the gate tests can check B3, B4 and B10 at every aspect this game
## supports rather than only at whatever size the test runner happens to use -
## and it is the aspects that differ that broke this in the first place.
func layout_for(view: Vector2) -> void:
	if _pads.size() < 4:
		return
	var floor_y := view.y - MARGIN

	# Left thumb: the two directions, side by side in the corner.
	var left_row_y := floor_y - BTN
	_place("move_left", Vector2(MARGIN, left_row_y))
	var right_x := MARGIN + BTN + GAP
	_place("move_right", Vector2(right_x, left_row_y))

	# Right thumb, in the order that thumb reaches them: jump in the corner where
	# it rests, SPRINT immediately inboard of it, zap furthest out.
	#
	# Sprint is here, and not with the directions, because of the Game Boy. A and B
	# sit side by side: one thumb either covers both or leaves B for the instant it
	# takes to press A, and the run survives that instant. Sprint on the left
	# cluster made that roll impossible -- the two buttons were on opposite sides
	# of the screen, so the only way to sprint and jump was a third finger, which
	# is what made a latch look necessary. Adjacent, a momentary pad is enough.
	#
	# Measured against the 6-tile gaps in levels 6 and 8: sprint held through the
	# jump reaches 9.83 tiles, letting go and jumping at once reaches 6.55, and a
	# quarter-second of hesitation reaches 6.00. The roll clears the gap; a slow
	# thumb is what does not, and sprintDecelPerSec is the number that decides how
	# slow is too slow.
	#
	# Zap moving outboard is the right cost: it is the pad pressed least. Jump is
	# taller than the others, so sharing the floor line already gives the pair the
	# slight diagonal a Game Boy has.
	var jump_x := view.x - MARGIN - JUMP_BTN
	_place("jump", Vector2(jump_x, floor_y - JUMP_BTN))
	var sprint_x := jump_x - GAP - BTN
	_place("sprint", Vector2(sprint_x, floor_y - BTN))
	_place("shoot", Vector2(sprint_x - GAP - BTN, floor_y - BTN))
	for pad in _pads:
		pad.queue_redraw()

func _place(action: String, at: Vector2) -> void:
	var pad: TouchPad = _by_action.get(action, null)
	if pad != null:
		pad.position = at

## Every pad's rect in viewport space, for the gates.
func pad_rects() -> Array[Rect2]:
	var out: Array[Rect2] = []
	for pad in _pads:
		out.append(Rect2(pad.position, (pad.shape as RectangleShape2D).size))
	return out
