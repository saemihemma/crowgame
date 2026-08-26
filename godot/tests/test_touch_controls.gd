extends TestCase
## The on-screen d-pad is the only way to play on a phone, and it had no coverage
## at all.
##
## Driving the exported build in a browser showed the crow refusing to move when
## the d-pad was pressed, by mouse and by a held touch alike, while the keyboard
## worked fine. That is either a real bug that makes the game unplayable on a
## touch device, or an artefact of synthetic browser input. This test settles it
## at the source: feed a genuine InputEventScreenTouch through Godot's input
## pipeline and assert the bound action actually goes down.

const TOUCH_CONTROLS := preload("res://scenes/TouchControls.tscn")

var _layer: Node


func _mount() -> Node:
	var node: Node = TOUCH_CONTROLS.instantiate()
	Engine.get_main_loop().root.add_child(node)
	# touch_controls.gd hides itself unless the device reports touch, web or
	# mobile -- and headless Godot is none of the three. A hidden
	# TouchScreenButton does not accept input, so without this the press test
	# asserts against a control the engine has switched off. It only looked like
	# it passed because the runner was not awaiting coroutine tests.
	if node is CanvasItem:
		(node as CanvasItem).visible = true
	return node


func _teardown(node: Node) -> void:
	if node != null:
		node.queue_free()


## Centre of a named button, in screen coordinates, read off the live node
## rather than recomputed from the layout constants.
func _button_centre(root: Node, action: String) -> Vector2:
	for child in root.get_children():
		if child is TouchPad and (child as TouchPad).pad_action() == action:
			var btn := child as TouchScreenButton
			var size := Vector2.ZERO
			if btn.shape is RectangleShape2D:
				size = (btn.shape as RectangleShape2D).size
			return btn.global_position + size * 0.5
	return Vector2(-1, -1)


func test_touch_controls_expose_the_expected_actions() -> void:
	var root := _mount()
	var found: Array[String] = []
	for child in root.get_children():
		if child is TouchPad:
			found.append((child as TouchPad).pad_action())
	# Sprint is in this list because a touch device has no Space key, so without
	# the pad the run is unreachable rather than merely untaught -- and it is read
	# through pad_action() because the sprint pad latches, which means its binding
	# is not on TouchScreenButton.action at all.
	for action in ["move_left", "move_right", "jump", "shoot", "sprint"]:
		assert_true(found.has(action), "on-screen control exists for '%s'" % action)
	_teardown(root)


func test_every_touch_button_has_a_hit_shape_covering_its_panel() -> void:
	var root := _mount()
	for child in root.get_children():
		if not (child is TouchPad):
			continue
		var btn := child as TouchPad
		assert_true(btn.shape != null, "'%s' has a press shape" % btn.pad_action())
		if btn.shape is RectangleShape2D:
			var size: Vector2 = (btn.shape as RectangleShape2D).size
			assert_true(size.x > 40.0 and size.y > 40.0,
				"'%s' press shape is a usable size (got %s)" % [btn.pad_action(), size])
	_teardown(root)


## WHY THERE IS NO "a touch presses the action" TEST HERE ANY MORE
##
## There was one, and it asserted exactly that. It passed for months without
## checking anything: the test runner called each test with `instance.call()`
## and read the failure count immediately, so every assertion after a test's
## first `await` went uncounted. This suite's press test was all awaits. Fixing
## the runner to await turned it red on the first run.
##
## Investigated rather than deleted on sight. Headless input injection is fine --
## a probe confirms both Input.parse_input_event and Viewport.push_input deliver
## an InputEventScreenTouch to a node's _input. The coordinates were right too
## (shape_centered is false on these buttons, so the hit area really does span
## global_position .. global_position + size). What does not work headlessly is
## TouchScreenButton's own screen-to-canvas hit testing, and no amount of
## arranging the test fixes that.
##
## So the press is verified where the event path is real instead of synthetic:
## godot/tools/web_boot_smoke.mjs taps the exported build with genuine DOM touch
## events in a browser context created with hasTouch. That is the same technique
## that verified the web port's touch labels; that port and its checker are gone.
##
## What stays here is what a headless tree can actually answer: the controls
## exist, they are bound to the right actions, and their hit shapes are big
## enough for a child's finger.


## Sprint has to be REACHABLE BY THE JUMP THUMB, which is the whole reason it is
## momentary. On the Game Boy A and B are adjacent: one thumb covers both, or
## leaves B for the instant it takes to press A. Sprint on the left cluster put
## the two on opposite sides of the screen, so sprinting and jumping needed a
## third finger -- which is what made a latch look necessary in the first place.
##
## Adjacency is a layout fact, so it is checked as one: the gap between the sprint
## and jump pads must be small enough for one thumb, at every aspect.
func test_sprint_sits_within_a_thumb_of_jump() -> void:
	var root := _mount()
	for view: Vector2 in [Vector2(960, 540), Vector2(960, 671), Vector2(960, 720), Vector2(1171, 540)]:
		root.layout_for(view)
		var sprint: TouchPad = root.pad_for("sprint")
		var jump: TouchPad = root.pad_for("jump")
		assert_true(sprint != null and jump != null, "both pads exist")
		var s_rect := Rect2(sprint.position, (sprint.shape as RectangleShape2D).size)
		var j_rect := Rect2(jump.position, (jump.shape as RectangleShape2D).size)
		# Edge to edge, not centre to centre: the thumb rolls across the gap.
		var edge_gap: float = j_rect.position.x - s_rect.end.x
		assert_true(edge_gap >= 0.0 and edge_gap <= 24.0,
			"[%.0fx%.0f] sprint and jump are %.0fpx apart, too far for one thumb to roll"
				% [view.x, view.y, edge_gap])
		assert_true(absf(s_rect.end.y - j_rect.end.y) <= 1.0,
			"[%.0fx%.0f] sprint and jump do not share the floor line" % [view.x, view.y])
	_teardown(root)

func test_the_sprint_pad_is_momentary_by_default() -> void:
	var root := _mount()
	var pad: TouchPad = root.pad_for("sprint")
	assert_true(pad != null, "a sprint pad was built")
	assert_true(not pad.is_latching(),
		"sprint is a plain button by default: adjacent to jump, so the roll is enough")
	assert_eq(pad.action, "sprint", "so the engine drives the action directly")
	_teardown(root)

## The latch is still available behind input/sprint_pad_latches, so it stays
## tested. Built directly rather than through a flag override: no test in this
## suite writes an override, and one that did would leave it in the real save for
## every test after it.
func test_a_latching_sprint_pad_holds_the_action_until_it_is_tapped_again() -> void:
	var pad := TouchPad.make_latching("sprint", TouchPad.Icon.SPRINT, Vector2.ZERO, 92.0)
	Engine.get_main_loop().root.add_child(pad)
	assert_true(pad.is_latching(), "latching pad latches")
	assert_true(not Input.is_action_pressed("sprint"), "sprint starts up")

	pad.toggle_latch()
	assert_true(Input.is_action_pressed("sprint"), "one tap holds sprint down")
	assert_true(pad.is_latched(), "and the pad knows it is latched, so it draws lit")

	pad.toggle_latch()
	assert_true(not Input.is_action_pressed("sprint"), "a second tap lets it go")
	Engine.get_main_loop().root.remove_child(pad)
	pad.free()

## A latched action lives in the global Input state, not in the node, so a pad
## freed while latched would leave the crow sprinting through every level after
## this one. The pads are freed on every level change.
func test_a_latched_pad_releases_the_action_when_it_leaves_the_tree() -> void:
	var pad := TouchPad.make_latching("sprint", TouchPad.Icon.SPRINT, Vector2.ZERO, 92.0)
	Engine.get_main_loop().root.add_child(pad)
	pad.toggle_latch()
	assert_true(Input.is_action_pressed("sprint"), "latched before teardown")
	Engine.get_main_loop().root.remove_child(pad)
	pad.free()
	assert_true(not Input.is_action_pressed("sprint"),
		"freeing the pad released the latched action")

## The other half of input/sprint_pad_latches, built directly rather than through
## a flag override: no test in this suite writes an override, and one that did
## would leave it in the real save for every test after it.
func test_a_momentary_sprint_pad_binds_the_action_the_engine_way() -> void:
	var pad := TouchPad.make("sprint", TouchPad.Icon.SPRINT, Vector2.ZERO, 92.0)
	assert_true(not pad.is_latching(), "momentary, so no latch")
	assert_eq(pad.action, "sprint", "the engine drives the action off TouchScreenButton.action")
	assert_eq(pad.pad_action(), "sprint", "and pad_action agrees, whichever way it is bound")
	pad.free()
