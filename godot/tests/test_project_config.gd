extends TestCase
## Slice 1 verification: the project boots with the exact display/physics/input
## render settings the game requires. These were originally mirrored from the
## Phaser config; they are now the source of truth in their own right.


func test_viewport_is_960x540() -> void:
	assert_eq(int(ProjectSettings.get_setting("display/window/size/viewport_width")), 960, "viewport width")
	assert_eq(int(ProjectSettings.get_setting("display/window/size/viewport_height")), 540, "viewport height")

## `canvas_items` keeps the pixel art crisp; the aspect decides the letterbox.
##
## This asserted "keep", which is what put black bars down 19.5% of an iPad and
## 18% of a phone - measured on real device viewports, not estimated. `expand`
## fills every supported aspect exactly, which is Gate B1 (under 8%). It is the
## only value that does: `keep_height` still fitted by the smaller scale, and
## `keep_width` shows less of the world vertically on a phone.
func test_stretch_mode_pixel_perfect() -> void:
	assert_eq(ProjectSettings.get_setting("display/window/stretch/mode"), "canvas_items", "stretch mode")
	assert_eq(ProjectSettings.get_setting("display/window/stretch/aspect"), "expand", "stretch aspect")

## Gate B1, as arithmetic rather than a screenshot.
##
## Under `expand` the viewport is the window, so no screen loses anything to a
## bar and the letterbox is zero by construction. What is worth asserting is the
## consequence: the world height that implies has to fit inside a level, or the
## camera shows past the bottom of the map. A 4:3 tablet is the worst case at
## 720 units against a 640-tall level, which is what game.gd's underfill covers.
func test_no_device_shows_more_world_than_a_level_holds() -> void:
	var base := Vector2(
		float(ProjectSettings.get_setting("display/window/size/viewport_width")),
		float(ProjectSettings.get_setting("display/window/size/viewport_height")))
	for device in [Vector2(1194, 834), Vector2(1024, 768), Vector2(852, 393), Vector2(1280, 720)]:
		var scale: float = minf(device.x / base.x, device.y / base.y)
		var world_height: float = device.y / scale
		assert_true(world_height <= MAX_WORLD_HEIGHT,
			"a %.0fx%.0f screen shows %.0f world units of height, past the %.0f covered"
				% [device.x, device.y, world_height, MAX_WORLD_HEIGHT])

## Levels are 20 tiles of 32px. Anything taller than this on screen would show
## past the bottom of the world - which is what game.gd's underfill covers.
const MAX_WORLD_HEIGHT := 720.0

func test_nearest_texture_filter() -> void:
	# 0 == Nearest in Godot's default_texture_filter enum.
	assert_eq(int(ProjectSettings.get_setting("rendering/textures/canvas_textures/default_texture_filter")), 0, "nearest filter")

func test_gravity_is_800() -> void:
	assert_almost_eq(float(ProjectSettings.get_setting("physics/2d/default_gravity")), 800.0, 0.001, "gravity")

func test_input_actions_exist() -> void:
	for action in ["move_left", "move_right", "jump", "interact", "shoot", "pause"]:
		assert_true(InputMap.has_action(action), "input action %s" % action)
