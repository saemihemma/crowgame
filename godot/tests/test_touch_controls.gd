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
	return node


func _teardown(node: Node) -> void:
	if node != null:
		node.queue_free()


## Centre of a named button, in screen coordinates, read off the live node
## rather than recomputed from the layout constants.
func _button_centre(root: Node, action: String) -> Vector2:
	for child in root.get_children():
		if child is TouchScreenButton and child.action == action:
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
		if child is TouchScreenButton:
			found.append((child as TouchScreenButton).action)
	for action in ["move_left", "move_right", "jump", "interact", "shoot"]:
		assert_true(found.has(action), "on-screen control exists for '%s'" % action)
	_teardown(root)


func test_every_touch_button_has_a_hit_shape_covering_its_panel() -> void:
	var root := _mount()
	for child in root.get_children():
		if not (child is TouchScreenButton):
			continue
		var btn := child as TouchScreenButton
		assert_true(btn.shape != null, "'%s' has a press shape" % btn.action)
		if btn.shape is RectangleShape2D:
			var size: Vector2 = (btn.shape as RectangleShape2D).size
			assert_true(size.x > 40.0 and size.y > 40.0,
				"'%s' press shape is a usable size (got %s)" % [btn.action, size])
	_teardown(root)


## The one that matters: does pressing the d-pad actually press the action?
func test_a_touch_on_the_dpad_presses_its_action() -> void:
	var root := _mount()
	var centre := _button_centre(root, "move_right")
	assert_true(centre.x >= 0.0, "found the move_right control")
	if centre.x < 0.0:
		_teardown(root)
		return

	# Make sure we are not reading a leftover press.
	Input.action_release("move_right")
	await Engine.get_main_loop().process_frame

	var down := InputEventScreenTouch.new()
	down.index = 0
	down.pressed = true
	down.position = centre
	Input.parse_input_event(down)
	await Engine.get_main_loop().process_frame
	await Engine.get_main_loop().process_frame

	var pressed_during := Input.is_action_pressed("move_right")
	assert_true(pressed_during,
		"a touch at the centre of the on-screen d-pad presses move_right — "
		+ "if this fails, the game cannot be played on a touch device")

	var up := InputEventScreenTouch.new()
	up.index = 0
	up.pressed = false
	up.position = centre
	Input.parse_input_event(up)
	await Engine.get_main_loop().process_frame
	await Engine.get_main_loop().process_frame

	assert_true(not Input.is_action_pressed("move_right"),
		"releasing the touch releases move_right")
	Input.action_release("move_right")
	_teardown(root)
