extends TestCase
## The on-screen controls, checked against the gates in
## brand/PRODUCTION_PLAN.md at every aspect this game supports.
##
## These exist because the controls were laid out from ProjectSettings' fixed
## 960x540 while the viewport is `expand` and is 1171x540 on a phone and 960x720
## on a 4:3 tablet. The buttons detached from the corners and floated in the
## middle of the level, and nothing failed - the only thing that had ever checked
## this screen was a person looking at one desktop screenshot.

const TOUCH_SCENE := preload("res://scenes/TouchControls.tscn")

## Base 960x540 with `expand`: the viewport is 960/aspect tall and as wide as the
## aspect makes it. These are the real devices, not round numbers.
const VIEWPORTS := [
	{"name": "16:9 desktop", "size": Vector2(960, 540)},
	{"name": "iPad 11in landscape", "size": Vector2(960, 671)},
	{"name": "iPad 4:3 landscape", "size": Vector2(960, 720)},
	{"name": "iPhone 15 landscape", "size": Vector2(1171, 540)},
]

## Gate B3: nothing tappable smaller than this on its short edge.
const MIN_TARGET := 88.0
## Gate B4: nothing interactive within this of a screen edge.
const SAFE_MARGIN := 32.0
## Gate B10: a control has to be reachable by a thumb that is also holding the
## device, which means the bottom corners - not the middle of the screen.
const THUMB_BAND := 0.45

func _reset() -> void:
	_failures.clear()
	_assertions = 0

func _mounted() -> CanvasLayer:
	var controls: CanvasLayer = TOUCH_SCENE.instantiate()
	Engine.get_main_loop().root.add_child(controls)
	return controls

func test_every_control_meets_the_touch_target_floor() -> void:
	var controls := _mounted()
	for viewport in VIEWPORTS:
		controls.layout_for(viewport["size"])
		for rect: Rect2 in controls.pad_rects():
			assert_true(minf(rect.size.x, rect.size.y) >= MIN_TARGET,
				"[%s] a control is %.0fx%.0f, under the %.0fpx floor"
					% [viewport["name"], rect.size.x, rect.size.y, MIN_TARGET])
	controls.queue_free()

func test_no_control_sits_in_the_safe_area() -> void:
	var controls := _mounted()
	for viewport in VIEWPORTS:
		var view: Vector2 = viewport["size"]
		controls.layout_for(view)
		for rect: Rect2 in controls.pad_rects():
			assert_true(rect.position.x >= SAFE_MARGIN - 0.5 and rect.position.y >= SAFE_MARGIN - 0.5
					and rect.end.x <= view.x - SAFE_MARGIN + 0.5 and rect.end.y <= view.y - SAFE_MARGIN + 0.5,
				"[%s] a control at %s..%s breaks the %.0fpx safe area of a %.0fx%.0f screen"
					% [viewport["name"], str(rect.position), str(rect.end), SAFE_MARGIN, view.x, view.y])
	controls.queue_free()

## The failure this actually caught: controls laid out from a fixed size land in
## the middle of the screen on any other size.
func test_controls_stay_in_the_thumb_corners() -> void:
	var controls := _mounted()
	for viewport in VIEWPORTS:
		var view: Vector2 = viewport["size"]
		controls.layout_for(view)
		for rect: Rect2 in controls.pad_rects():
			var centre: Vector2 = rect.get_center()
			assert_true(centre.y >= view.y * (1.0 - THUMB_BAND),
				"[%s] a control's centre is at y=%.0f, above the bottom %d%% of a %.0f-tall screen"
					% [viewport["name"], centre.y, int(THUMB_BAND * 100), view.y])
			var from_nearest_side: float = minf(centre.x, view.x - centre.x)
			assert_true(from_nearest_side <= view.x * THUMB_BAND,
				"[%s] a control's centre is %.0fpx from the nearest side of a %.0f-wide screen"
					% [viewport["name"], from_nearest_side, view.x])
	controls.queue_free()

## Two controls under one thumb is a mis-press, and a mis-press in this game
## means firing when you meant to jump.
func test_controls_do_not_overlap_each_other() -> void:
	var controls := _mounted()
	for viewport in VIEWPORTS:
		controls.layout_for(viewport["size"])
		var rects: Array = controls.pad_rects()
		for i in rects.size():
			for j in range(i + 1, rects.size()):
				assert_true(not rects[i].intersects(rects[j]),
					"[%s] controls %d and %d overlap (%s vs %s)"
						% [viewport["name"], i, j, str(rects[i]), str(rects[j])])
	controls.queue_free()
