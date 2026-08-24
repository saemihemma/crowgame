extends TestCase
## Slice 1 verification: the project boots with the exact display/physics/input
## render settings the game requires. These were originally mirrored from the
## Phaser config; they are now the source of truth in their own right.

func _reset() -> void:
	_failures.clear()
	_assertions = 0

func test_viewport_is_960x540() -> void:
	assert_eq(int(ProjectSettings.get_setting("display/window/size/viewport_width")), 960, "viewport width")
	assert_eq(int(ProjectSettings.get_setting("display/window/size/viewport_height")), 540, "viewport height")

func test_stretch_mode_pixel_perfect() -> void:
	assert_eq(ProjectSettings.get_setting("display/window/stretch/mode"), "canvas_items", "stretch mode")
	assert_eq(ProjectSettings.get_setting("display/window/stretch/aspect"), "keep", "stretch aspect")

func test_nearest_texture_filter() -> void:
	# 0 == Nearest in Godot's default_texture_filter enum.
	assert_eq(int(ProjectSettings.get_setting("rendering/textures/canvas_textures/default_texture_filter")), 0, "nearest filter")

func test_gravity_is_800() -> void:
	assert_almost_eq(float(ProjectSettings.get_setting("physics/2d/default_gravity")), 800.0, 0.001, "gravity")

func test_input_actions_exist() -> void:
	for action in ["move_left", "move_right", "jump", "interact", "shoot", "pause"]:
		assert_true(InputMap.has_action(action), "input action %s" % action)
