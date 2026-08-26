extends Node
## Screenshot harness for the Godot build — the replacement for the Playwright
## loop that drove the retired web port.
##
## The concept-then-measure process in brand/README.md depends on being
## able to look at the real game, not at source. Godot renders under a virtual
## display with the gl_compatibility driver, so this runs in CI and in a
## container:
##
##   xvfb-run -a --server-args="-screen 0 1280x800x24" \
##     godot --path godot res://tools/capture/Capture.tscn -- level_01 play 1194x834
##
## The third argument is the window size to photograph at. It exists because
## every judgement about this game had been made at one 16:9 desktop viewport,
## while the device it is actually played on is a 4:3 tablet - so the letterbox
## nobody could see was never going to get fixed.
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
##   pause       the pause overlay over a live level
##   complete    the run-complete celebration
##   death       the death beat, half way through, on the lives-remaining path
##   hud-hurt    the HUD with a heart spent
##   hud-streak  the HUD with the streak flame lit
##   hud-ability the HUD with an ability chip in its slot
##
## The three hud-* variants exist because those states were DESIGNED and never
## photographed. A lost heart needs damage, the flame needs consecutive correct
## answers, and the slots need a grant -- none of which happens while a harness
## walks a crow across a field, so all three shipped on the strength of the code
## reading plausibly. They are driven through the same public entry points the
## game uses, not by writing to the HUD, so a shot is evidence about the real
## state and not about the harness.

const GAME_SCENE := preload("res://scenes/Game.tscn")

## Screens reachable by name through SceneRouter. Passing one of these as the
## "level" captures that screen instead of a level, so the menus are in the same
## review loop as the game. They were not, which is how the first screen anyone
## sees stayed a flat blue page with a grey slab on it while the in-game HUD got
## three rebuilds.
const SCREENS := ["login", "main_menu", "level_select"]
## Which owl in the level to walk to, when a variant needs a particular one.
## Set with a fourth CLI argument; defaults to the first.
var _owl_index := 0
## Screens with sub-states worth photographing on their own. The login text
## fields only exist inside the create-a-player step, which is exactly why they
## sat as unstyled engine defaults for so long - no shot ever contained them.
const SCREEN_SUBSTATES := {"login-new": {"screen": "login", "method": "_show_new_player"}}

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
## What was asked for on the command line, so the shot can be compared against
## the window rather than against itself.
var _requested_window := Vector2i.ZERO

func _ready() -> void:
	_apply_window_size()
	var owl_args := OS.get_cmdline_user_args()
	if owl_args.size() > 3 and owl_args[3] != "":
		_owl_index = int(owl_args[3])
	# Which language to photograph in. Icelandic is the language this game is
	# FOR, and until this existed every shot in output/godot-shots was English -
	# so the locale whose words are longer, and whose grammar changes with the
	# number in the sentence, was the one nobody ever looked at.
	if owl_args.size() > 4 and owl_args[4] != "":
		TextManager.set_locale(owl_args[4])
	# The pause overlay pauses the whole tree, which would stop this node's own
	# frame loop and hang the harness. Capture keeps stepping regardless of the
	# game's pause state - it is a camera, not a participant.
	process_mode = Node.PROCESS_MODE_ALWAYS
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

## Resize the real window before anything renders, so `expand` stretch resolves
## the viewport against the size being photographed.
func _apply_window_size() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() < 3 or args[2] == "":
		return
	var parts := args[2].split("x", false)
	if parts.size() != 2:
		printerr("[capture] bad size '%s'; expected WxH" % args[2])
		return
	var size := Vector2i(int(parts[0]), int(parts[1]))
	if size.x <= 0 or size.y <= 0:
		return
	# The window itself is sized by --resolution on the command line, before the
	# first frame. This only records what was asked for, so the shot can be
	# compared against the window rather than against itself - measuring the
	# viewport against a root size this harness had set was how a 19.5%
	# letterbox first reported as 0%.
	_requested_window = size

func _resolve_levels() -> PackedStringArray:
	var known := PackedStringArray()
	for entry in LevelManager.get_levels():
		known.append(entry.get("key", ""))

	var args := OS.get_cmdline_user_args()
	if args.size() == 0 or args[0] == "":
		return known

	# A key nobody has has to be an error, not an empty picture. Asking for a
	# level that does not exist used to load nothing and photograph the result:
	# bare sky, no ground, no crow, the HUD floating over it. That shot is
	# indistinguishable from a level that failed to build, and it cost a real
	# investigation before anyone noticed the level had never existed.
	var wanted := args[0].split(",", false)
	for key in wanted:
		if not known.has(key):
			printerr("[capture] no such level '%s'; have: %s" % [key, ", ".join(known)])
			get_tree().quit(1)
			return PackedStringArray()
	return wanted

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
	if SCREEN_SUBSTATES.has(key):
		var spec: Dictionary = SCREEN_SUBSTATES[key]
		_game = load(SceneRouter.path_of(String(spec["screen"]))).instantiate()
		add_child(_game)
		if _game.has_method(String(spec["method"])):
			_game.call_deferred(String(spec["method"]))
		_frames = 0
		_staged = false
		return
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
		# Before instantiate, deliberately. A banked big coin decides it is a
		# ghost in its own _ready(), so a record written at staging time -- which
		# runs after the level has spawned -- would photograph a live coin and
		# claim it was the returning-player state.
		if String(_jobs[_index]["variant"]) == "bigcoins-ghost":
			var data: Dictionary = SaveManager.get_data()
			data["levelRecords"] = {key: {"bigCoins": ["c1"]}}
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
	var job_key := String(_jobs[_index]["level"])
	if SCREENS.has(job_key) or SCREEN_SUBSTATES.has(job_key):
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
	if variant == "math-wrong":
		return WRONG_HOLD_FRAMES
	if variant == "death":
		return _death_hold_frames()
	return BOARD_SETTLE_FRAMES

## Where inside the death beat to photograph it.
##
## The beat fades in over a fifth of `death.hold_ms` and out over the last fifth,
## so a shot taken at either end catches a transparent overlay and reports the
## feature as missing. Half way through is the frame a child actually reads.
##
## Derived from the flag rather than fixed: change hold_ms and the shot follows
## it, instead of the harness quietly starting to photograph the fade.
static func _death_hold_frames() -> int:
	return maxi(2, int(DeathBeat.hold_seconds() * 60.0 * 0.5))

## Drive the game into the state this variant is meant to photograph. Returns
## false if the level cannot reach it (a level with no owl has no maths board).
func _stage(variant: String) -> bool:
	# Screens that do not need an owl are staged before one is looked for: a
	# level with no NPC still has a pause menu and can still be completed.
	if variant == "pause" or variant == "complete":
		return _stage_overlay(variant)
	# The locked door, staged through Game's own entry point - the same call the
	# door makes when the player walks into it with owls still in chains. No owl
	# is needed: a fresh level has freed none, so the card is already truthful.
	# The big coins. `bigcoins` is one waiting to be found; `bigcoins-ghost` is
	# the same coin already banked, which is what a child sees on their second
	# visit -- and the whole reason to come back, so it is worth a shot of its own.
	# The record for the ghost is written in _load_next, before the level spawns.
	if variant.begins_with("bigcoins"):
		var coin := _find_big_coin()
		if coin == null:
			printerr("[capture] %s holds no big coins" % LevelManager.get_current_level_key())
			return false
		_stand_at(coin)
		return true
	if variant.begins_with("door-locked"):
		if not _game.has_method("refuse_door"):
			printerr("[capture] Game has no refuse_door()")
			return false
		# door-locked-part frees one owl first, through the same signal a real
		# rescue fires. Zero-freed and part-freed are the two shots worth having:
		# the first shows the row of empty sockets, the second is the only one
		# that proves gold-versus-empty reads as progress rather than as decoration.
		if variant == "door-locked-part":
			EventBus.owl_saved.emit()
		_game.call("refuse_door")
		return true
	if variant == "death":
		return _stage_death()
	if variant.begins_with("hud-"):
		return _stage_hud(variant)
	var owl := _find_owl()
	if owl == null:
		return false
	_stand_at(owl)
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
	# Filtered the way the level would filter it. Asking for a domain alone
	# returned whatever the pool had - a level_01 screenshot showed "87 + 7",
	# which the real path can never serve a child in world one, and a harness
	# that photographs content the game does not serve is worse than no shot.
	var gating: Dictionary = {}
	var entry: Variant = LevelManager.get_current_level()
	if entry is Dictionary and entry.get("mathGating", null) is Dictionary:
		gating = entry["mathGating"]
	var band: Array = gating.get("difficultyBand", [1, 2])
	var problem = MathProblemManager.get_next_problem({
		"domains": [domain],
		"difficultyRange": band,
		"maxCurriculumStep": int(round(float(band[1]) * 10.0)),
		"maxOperand": 20,
	})
	if problem == null:
		return false
	var overlay = _game.get_math_challenge()
	overlay.present(problem, {
		"npcName": String(owl.definition.get("name", "")),
		"npcGreeting": "How many?",
	})
	return true

## Drive the HUD into a state that needs something to have HAPPENED.
##
## Each goes through the game's own entry point rather than the HUD's, so the
## shot is evidence about the state the game can actually reach:
##
##   hud-hurt    Game.hurt_player(), the same call a hazard makes
##   hud-streak  EventBus.math_answer_submitted, which is what Game listens to
##               in order to count a streak. Fired past the flame threshold,
##               read from fx_tuning rather than assumed to be three.
##   hud-ability EventBus.ability_granted, which is what the HUD listens to.
##               There is no manager to ask: gameplay/ability_manager.gd is not
##               wired to anything, and the signal is the whole contract.
## The death beat, over a live level.
##
## Driven through hurt_player() rather than by building the overlay directly: a
## shot has to be evidence about the real game, and the interesting half of this
## feature is that the LIVES-REMAINING path shows a beat at all -- it used to
## teleport the crow with no acknowledgement. Spending one heart of three
## reaches that path, which is the one a child hits.
func _stage_death() -> bool:
	if not _game.has_method("hurt_player"):
		printerr("[capture] Game has no hurt_player()")
		return false
	_game.call("hurt_player")
	return true

func _stage_hud(variant: String) -> bool:
	if variant == "hud-hurt":
		if not _game.has_method("hurt_player"):
			printerr("[capture] Game has no hurt_player()")
			return false
		_game.call("hurt_player")
		return true

	if variant == "hud-streak":
		# One past the threshold, so the shot shows a lit flame rather than the
		# frame it lights on.
		var flame_at := int(Config.fx("streak/flame", 3))
		for _i in flame_at + 1:
			EventBus.math_answer_submitted.emit({"problemId": "capture", "isCorrect": true})
		return true

	if variant == "hud-ability":
		var declared: Array = DataManager.get_dict("ABILITIES").get("abilities", [])
		var id := ""
		for entry in declared:
			if entry is Dictionary and String((entry as Dictionary).get("id", "")) != "":
				id = String((entry as Dictionary)["id"])
				break
		if id == "":
			printerr("[capture] abilities.json declares nothing to grant")
			return false
		EventBus.ability_granted.emit({"abilityId": id})
		return true

	return false

func _stage_overlay(variant: String) -> bool:
	var method := "_toggle_pause" if variant == "pause" else "_show_completion_screen"
	if not _game.has_method(method):
		printerr("[capture] Game has no %s()" % method)
		return false
	_game.call(method)
	return true

## Put the crow where a player would be standing when this board opens.
##
## Interacting with an owl from across the level leaves the crow back at the
## spawn with the camera on him, which made every maths screenshot show a crow
## comfortably clear of the board - and the board-covers-the-player bug look
## fixed when it was not. In play the crow is at the owl and the camera is
## centred on him, which is exactly where the board is.
func _stand_at(owl: Node2D) -> void:
	var player = _game.get_player()
	if player == null or not is_instance_valid(player):
		return
	player.global_position = owl.global_position + Vector2(-40.0, 0.0)
	var camera := player.get_node_or_null("Camera") as Camera2D
	if camera != null:
		# Skip the follow lerp: the shot is taken a fraction of a second later
		# and a smoothed camera would still be sliding.
		camera.reset_smoothing()
		camera.force_update_scroll()

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
	var owls: Array[Node] = []
	for c in world.get_children():
		if c.scene_file_path.get_file() == "Npc.tscn":
			owls.append(c)
	if owls.is_empty():
		return null
	return owls[clampi(_owl_index, 0, owls.size() - 1)] as Node2D

## The first big coin in the level, so the shot is of a real spawned one rather
## than of a node the harness built for the photograph.
func _find_big_coin() -> Node2D:
	var world := _game.get_node_or_null("World")
	if world == null:
		return null
	for c in world.get_children():
		if c.scene_file_path.get_file() == "BigCoin.tscn":
			return c as Node2D
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
		var note := ""
		if _requested_window != Vector2i.ZERO:
			# The viewport IS the window when nothing is letterboxed, so any
			# shortfall is a bar. Printed on every sized shot, because the last
			# time this number was estimated instead of measured it was wrong by
			# 19.5% of an iPad screen.
			var used := float(image.get_width() * image.get_height()) \
				/ float(_requested_window.x * _requested_window.y)
			note = "  window %dx%d  letterbox %.1f%%" % [
				_requested_window.x, _requested_window.y, maxf(0.0, 100.0 - used * 100.0)]
		print("[capture] %s-%s  %dx%d%s" % [
			job["level"], job["variant"], image.get_width(), image.get_height(), note])

	# Leave no game paused behind: the next job gets a fresh, running tree.
	get_tree().paused = false
	_index += 1
	_load_next()
	set_physics_process(true)

func _advance() -> void:
	_index += 1
	_load_next()
