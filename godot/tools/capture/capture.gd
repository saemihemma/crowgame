extends Node
## Screenshot harness for the Godot build — the replacement for the Playwright
## loop that drove the retired web port.
##
## The concept-then-measure process in brand/PRODUCTION_PLAN.md depends on being
## able to look at the real game, not at source. Godot renders under a virtual
## display with the gl_compatibility driver, so this runs in CI and in a
## container:
##
##   xvfb-run -a --server-args="-screen 0 1280x800x24" \
##     godot --path godot res://tools/capture/Capture.tscn -- level_01,level_02
##
## Writes output/godot-shots/<level>-play.png. Levels default to the registry.

const GAME_SCENE := preload("res://scenes/Game.tscn")

## Frames to let a level settle before capturing: spawns, tweens and the first
## camera lerp all need to have happened or every shot is of a half-built scene.
const SETTLE_FRAMES := 45

const OUT_DIR := "res://../output/godot-shots"

var _levels: PackedStringArray = []
var _index := 0
var _frames := 0
var _game: Node2D = null
var _shots := 0

func _ready() -> void:
	_levels = _resolve_levels()
	if _levels.is_empty():
		push_error("[capture] no levels to capture")
		get_tree().quit(1)
		return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT_DIR))
	print("[capture] levels: ", ", ".join(_levels))
	_load_next()

func _resolve_levels() -> PackedStringArray:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0 and args[0] != "":
		return args[0].split(",", false)

	var out := PackedStringArray()
	for entry in LevelManager.get_levels():
		out.append(entry.get("key", ""))
	return out

func _load_next() -> void:
	if _game != null:
		_game.queue_free()
		_game = null

	if _index >= _levels.size():
		print("[capture] wrote %d shot(s)" % _shots)
		get_tree().quit(0)
		return

	var key := _levels[_index]
	_game = GAME_SCENE.instantiate()
	_game.level_key = key
	add_child(_game)
	_frames = 0

func _physics_process(_delta: float) -> void:
	if _game == null:
		return
	_frames += 1
	if _frames < SETTLE_FRAMES:
		return
	# Stop stepping while the capture awaits a drawn frame. Without this the
	# next level is loaded - and this one freed - before the await resolves, and
	# the shot is of an emptied tree: a flat background with no world in it.
	set_physics_process(false)
	_capture_and_advance()

func _capture_and_advance() -> void:
	var key := _levels[_index]

	# The viewport texture is only valid after the frame has actually been drawn.
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var path := "%s/%s-play.png" % [OUT_DIR, key]
	var err := image.save_png(path)
	if err != OK:
		push_error("[capture] save failed for %s: %d" % [key, err])
	else:
		_shots += 1
		print("[capture] %s  %dx%d" % [key, image.get_width(), image.get_height()])

	_index += 1
	_load_next()
	set_physics_process(true)
