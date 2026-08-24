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
##     godot --path godot res://tools/capture/Capture.tscn -- level_01,level_02 play,math
##
## Writes output/godot-shots/<level>-<variant>.png.
##
## Variants exist because "the game looks fine" was being decided entirely from
## shots of a player standing in a field. The maths board is where a child spends
## the minutes that matter, and until it was in this loop it was the only screen
## in the game no one had ever looked at.
##
##   play        the level as it plays
##   math        the maths board, open, awaiting an answer
##   math-wrong  the board mid-way through the wrong-answer beat
##   math-count  the board showing a counting problem, whose tokens are drawn
##               objects rather than a row of asterisks

const GAME_SCENE := preload("res://scenes/Game.tscn")

## Screens reachable by name through SceneRouter. Passing one of these as the
## "level" captures that screen instead of a level, so the menus are in the same
## review loop as the game. They were not, which is how the first screen anyone
## sees stayed a flat blue page with a grey slab on it while the in-game HUD got
## three rebuilds.
const SCREENS := ["login", "main_menu", "level_select"]

## Frames to let a level settle before capturing: spawns, tweens and the first
## camera lerp all need to have happened or every shot is of a half-built scene.
const SETTLE_FRAMES := 45
## The board pops in with an elastic entrance; capture after it has landed.
const BOARD_SETTLE_FRAMES := 30
## Far enough into the wrong-answer lockout to show its full state, comfortably
## short of the 600ms (~36 frame) re-enable that ends it.
const WRONG_HOLD_FRAMES := 18

const OUT_DIR := "res://../output/godot-shots"
const DEFAULT_VARIANTS := "play"

var _jobs: Array[Dictionary] = []
var _index := 0
var _frames := 0
## Typed as Node, not Node2D: the screens are Controls, and the assignment used
## to fail silently and leave this null - which the frame loop then read as
## "nothing loaded yet" and waited on forever.
var _game: Node = null
var _shots := 0
## Set once per job when its scripted interaction has been kicked off, so the
## step does not re-fire on every physics frame while we wait for it to land.
var _staged := false

func _ready() -> void:
	var levels := _resolve_levels()
	var variants := _resolve_variants()
	if levels.is_empty() or variants.is_empty():
		push_error("[capture] nothing to capture")
		get_tree().quit(1)
		return
	for key in levels:
		for variant in variants:
			_jobs.append({"level": key, "variant": variant})
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT_DIR))
	print("[capture] levels: ", ", ".join(levels))
	print("[capture] variants: ", ", ".join(variants))
	_load_next()

func _resolve_levels() -> PackedStringArray:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0 and args[0] != "":
		return args[0].split(",", false)

	var out := PackedStringArray()
	for entry in LevelManager.get_levels():
		out.append(entry.get("key", ""))
	return out

func _resolve_variants() -> PackedStringArray:
	var args := OS.get_cmdline_user_args()
	if args.size() > 1 and args[1] != "":
		return args[1].split(",", false)
	return DEFAULT_VARIANTS.split(",", false)

func _load_next() -> void:
	if _game != null:
		_game.queue_free()
		_game = null

	if _index >= _jobs.size():
		print("[capture] wrote %d shot(s)" % _shots)
		get_tree().quit(0)
		return

	var key := String(_jobs[_index]["level"])
	if SCREENS.has(key):
		var path := SceneRouter.path_of(key)
		if path == "" or not ResourceLoader.exists(path):
			printerr("[capture] unknown screen '%s'" % key)
			_index += 1
			_load_next()
			return
		_game = load(path).instantiate()
		if _game == null:
			printerr("[capture] could not instantiate screen '%s'" % key)
			_index += 1
			_load_next()
			return
	else:
		_game = GAME_SCENE.instantiate()
		_game.level_key = key
	add_child(_game)
	_frames = 0
	_staged = false

func _physics_process(_delta: float) -> void:
	# Never wait on a null scene: a failed instantiate used to stall the harness
	# indefinitely rather than reporting the job it could not photograph.
	if _game == null:
		printerr("[capture] no scene loaded for job %d; skipping" % _index)
		_index += 1
		_load_next()
		return
	_frames += 1
	if _frames < SETTLE_FRAMES:
		return

	# Variants that need a scripted interaction get it once, then wait for the
	# result to settle before the shot is taken.
	var variant := String(_jobs[_index]["variant"])
	# A screen has no owl to interact with; only "play" makes sense there.
	if SCREENS.has(String(_jobs[_index]["level"])):
		variant = "play"
	if variant != "play" and not _staged:
		if not _stage(variant):
			printerr("[capture] %s: could not stage '%s'; skipping" % [_jobs[_index]["level"], variant])
			_advance()
			return
		_staged = true
		_frames = SETTLE_FRAMES  # restart the settle clock for the staged state
		return
	if _staged and _frames < SETTLE_FRAMES + _hold_frames(variant):
		return

	# Stop stepping while the capture awaits a drawn frame. Without this the
	# next level is loaded - and this one freed - before the await resolves, and
	# the shot is of an emptied tree: a flat background with no world in it.
	set_physics_process(false)
	_capture_and_advance()

func _hold_frames(variant: String) -> int:
	return WRONG_HOLD_FRAMES if variant == "math-wrong" else BOARD_SETTLE_FRAMES

## Drive the game into the state this variant is meant to photograph. Returns
## false if the level cannot reach it (a level with no owl has no maths board).
func _stage(variant: String) -> bool:
	var owl := _find_owl()
	if owl == null:
		return false
	owl.interact()
	if variant == "math":
		return true
	if variant == "math-count":
		# Counting problems are a minority of the pool, so asking for one by
		# domain is the only way to photograph that layout reliably.
		return _represent_from_domain(owl, "counting")
	if variant == "math-wrong":
		# The board is built during interact(), so the wrong answer can be
		# submitted straight away; the hold above is what shows its aftermath.
		if not _game.is_math_challenge_active():
			return false
		var overlay = _game.get_math_challenge()
		var index := _wrong_index(overlay.current_problem)
		if index < 0:
			return false
		overlay.submit_answer(index)
		return true
	return false

## Swap the presented problem for one from a named domain, so a variant can
## photograph a specific question layout instead of whatever came up.
func _represent_from_domain(owl: Node2D, domain: String) -> bool:
	if not _game.is_math_challenge_active():
		return false
	var problem = MathProblemManager.get_next_problem({"domains": [domain]})
	if problem == null:
		return false
	var overlay = _game.get_math_challenge()
	overlay.present(problem, {
		"npcName": String(owl.definition.get("name", "")),
		"npcGreeting": "How many?",
	})
	return true

func _wrong_index(problem: Dictionary) -> int:
	var answer: Dictionary = problem.get("answer", {})
	var options: Array = answer.get("options", [])
	for i in options.size():
		if str(options[i]) != str(answer.get("correct", null)):
			return i
	return -1

func _find_owl() -> Node2D:
	var world := _game.get_node_or_null("World")
	if world == null:
		return null
	for c in world.get_children():
		if c.scene_file_path.get_file() == "Npc.tscn":
			return c
	return null

func _capture_and_advance() -> void:
	var job := _jobs[_index]

	# The viewport texture is only valid after the frame has actually been drawn.
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var path := "%s/%s-%s.png" % [OUT_DIR, job["level"], job["variant"]]
	var err := image.save_png(path)
	if err != OK:
		push_error("[capture] save failed for %s: %d" % [path, err])
	else:
		_shots += 1
		print("[capture] %s-%s  %dx%d" % [job["level"], job["variant"], image.get_width(), image.get_height()])

	_index += 1
	_load_next()
	set_physics_process(true)

func _advance() -> void:
	_index += 1
	_load_next()
