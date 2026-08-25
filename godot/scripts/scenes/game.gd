extends Node2D
## Game — Godot port of the GameScene core: level load, spawns, coins, lives,
## hazards, doors, camera follow, hurt/respawn/death, and pit death.
## NPCs/enemies arrive in slices 6-7. Screen shake + damage flash are ported as
## Godot-native FX (Tier-2), not transliterated Phaser tweens.

const PLAYER_SCENE := preload("res://scenes/Player.tscn")
const COIN_SCENE := preload("res://scenes/Coin.tscn")
const HAZARD_SCENE := preload("res://scenes/Hazard.tscn")
const DOOR_SCENE := preload("res://scenes/Door.tscn")
const NPC_SCENE := preload("res://scenes/Npc.tscn")
const ENEMY_SCENE := preload("res://scenes/Enemy.tscn")
const MATH_CHALLENGE_SCENE := preload("res://scenes/MathChallenge.tscn")
const MATH_TUTORIAL_SCENE := preload("res://scenes/MathTutorial.tscn")
const HUD_SCENE := preload("res://scenes/Hud.tscn")
const TOUCH_SCENE := preload("res://scenes/TouchControls.tscn")
const PAUSE_SCENE := preload("res://scenes/Pause.tscn")

const MAX_LIVES := 3
## How far below a level the soil is painted. The tallest supported viewport is
## 720 world units (4:3) against a 640-tall level, so 240 is three times the
## worst case - cheap insurance against a taller device than anyone has now.
const UNDERFILL_DEPTH := 240.0

@export var level_key := ""

var _parsed: Dictionary = {}
var _player: CharacterBody2D
var _world: Node2D
var _camera: Camera2D

var coin_count := 0
var coins_at_level_start := 0
## Consecutive correct answers within the level. Session state, so it lives here
## with coins and lives rather than in the HUD (which only draws it) or in the
## challenge overlay (which is rebuilt for every problem and would forget).
var streak := 0
## A wrong answer sets this; the next correct answer clears it. See §10.2 - the
## count itself survives a miss.
var streak_paused := false
var lives := MAX_LIVES
var transitioning := false
var respawning := false
var spawn_point := Vector2.ZERO

# Tier-2 FX state
var _shake_time := 0.0
var _shake_strength := 0.0
var _flash: ColorRect
var _sky: TextureRect
## Kept so the on-screen controls can be taken away while something else owns
## the screen. TouchScreenButton reads input in _input, which runs before the
## GUI layer, so an overlay's scrim does NOT stop a thumb from reaching the pads
## underneath it - a child could jump and fire mid-question.
var _touch: CanvasLayer

func _ready() -> void:
	coin_count = int(SaveManager.get_data().get("coins", 0))
	coins_at_level_start = coin_count
	_setup_fx_layer()
	EventBus.owl_saved.connect(_on_owl_saved)
	# Per attempt, not per problem: a miss has to dim the flame the moment it
	# happens, and a retry that lands has to relight it.
	EventBus.math_answer_submitted.connect(_on_answer_submitted)
	add_child(HUD_SCENE.instantiate())
	_touch = TOUCH_SCENE.instantiate()
	add_child(_touch)
	var key := level_key
	if key == "":
		key = LevelManager.get_current_level_key()
	if key == "":
		key = "level_01"
	LevelManager.set_current_level(key)
	_apply_level_theme(key)
	_load_level(key)

## Dress the level in its own world theme before anything reads a colour.
##
## Runs before _load_level so the sky, the HUD and every themed component build
## from the right palette on their first frame rather than being re-tinted after.
func _apply_level_theme(key: String) -> void:
	var entry = LevelManager.get_level(key)
	if entry == null:
		return
	var theme_id := String(entry.get("theme", ""))
	if theme_id == "":
		return
	if not ThemeManager.has_theme(theme_id):
		push_warning("[Game] level '%s' wants unknown theme '%s'; keeping current." % [key, theme_id])
		return
	if ThemeManager.get_theme_id() != theme_id:
		ThemeManager.set_theme(theme_id)


func _load_level(key: String) -> void:
	var entry = LevelManager.get_level(key)
	if entry == null:
		push_error("[Game] unknown level: %s" % key)
		return
	var map_path := "res://%s" % String(entry.get("mapFile", ""))
	if not FileAccess.file_exists(map_path):
		push_error("[Game] missing map file: %s" % map_path)
		return
	var f := FileAccess.open(map_path, FileAccess.READ)
	var level: Dictionary = JSON.parse_string(f.get_as_text())
	f.close()

	_paint_sky()

	_world = Node2D.new()
	_world.name = "World"
	add_child(_world)
	_parsed = LevelLoader.build(_world, level)
	_paint_underfill()

	lives = MAX_LIVES
	streak = 0
	streak_paused = false
	EventBus.streak_changed.emit(streak, streak_paused)
	transitioning = false
	respawning = false
	# Persist where the player is (GameScene.ts does this on create) so the
	# main menu's Continue resumes the right level.
	SaveManager.set_current_level(key)
	_spawn_entities()
	_setup_camera()
	var music := String(entry.get("music", ""))
	if music != "":
		AudioManager.play_music(music)
	EventBus.coins_changed.emit(coin_count)
	EventBus.lives_changed.emit(lives)
	# Deferred by a frame: the HUD is a sibling added in _ready, so on the very
	# first level it is still building its nodes when we get here and would miss
	# a same-frame emit. The ring would then sit on its placeholder count.
	_emit_owl_count.call_deferred()

## How many owls this level asks the player to free. The owl ring draws one
## segment per owl, so this is what turns the ring from decoration into a
## progress bar - and it has to come from the level, not a constant, because
## level_03 has three owls and level_99 has one.
func _emit_owl_count() -> void:
	var registry: Dictionary = DataManager.get_dict("NPC_REGISTRY")
	var by_id := {}
	for entry in registry.get("npcs", []):
		by_id[String(entry.get("id", ""))] = entry
	var owls := 0
	for s in _parsed.get("spawns", []):
		if String(s.get("type", "")) != "npc":
			continue
		var id := String(s.get("props", {}).get("npc_id", ""))
		var definition: Dictionary = by_id.get(id, {})
		# Only challengers count. A signpost NPC is not a goal.
		if String(definition.get("behavior", "")) == "math_challenger":
			owls += 1
	EventBus.level_owls.emit(owls)

## Data-driven spawning: player_spawn is special (player + camera); every other
## object type is looked up in spawn_registry.json -> scene, which self-configures
## from the Tiled object via setup_from_spawn(spawn). New object type = new scene
## + one registry entry, no code here.
## Two-stop sky gradient from the active theme.
##
## The sky is the largest region of every frame, so a hardcoded colour makes
## every world look like world 1 - which is exactly what the first capture of
## this build showed. brand/BRAND_SYSTEM.md section 5.4 owns the layer stack;
## this is the `sky` layer, scroll factor 0.
func _paint_sky() -> void:
	if _sky != null:
		_sky.queue_free()

	var top := ThemeManager.get_color_value("sky_top")
	var bottom := ThemeManager.get_color_value("sky_bottom")

	var gradient := Gradient.new()
	gradient.set_color(0, top)
	gradient.set_color(1, bottom)

	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill_from = Vector2(0, 0)
	texture.fill_to = Vector2(0, 1)
	texture.width = 8      # the gradient is vertical, so width can be tiny
	texture.height = 256

	_sky = TextureRect.new()
	_sky.name = "Sky"
	_sky.texture = texture
	_sky.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_sky.stretch_mode = TextureRect.STRETCH_SCALE
	_sky.set_anchors_preset(Control.PRESET_FULL_RECT)
	_sky.mouse_filter = Control.MOUSE_FILTER_IGNORE

	# Its own CanvasLayer below everything, so it neither scrolls with the world
	# nor needs every other node to declare a z_index.
	var layer := CanvasLayer.new()
	layer.name = "SkyLayer"
	layer.layer = -100
	layer.add_child(_sky)
	add_child(layer)


## Soil below the level, so a viewport taller than the level shows ground rather
## than sky under the ground.
##
## The viewport is `expand` now, which fills any screen but means its height in
## world units is 960/aspect: 540 on 16:9, 671 on an 11-inch iPad, 720 on a 4:3
## one. Levels are 640 tall. Camera limits cannot help - when the viewport is
## taller than the limit range there is nothing to clamp against - so on a tablet
## the camera showed the sky gradient continuing underneath the soil.
##
## Painted rather than built out of tiles: a real fix in the level data would be
## 80 rows of ground across six levels for a strip no player can ever reach,
## since everything below the ground is already a death plane.
func _paint_underfill() -> void:
	var level_w := int(_parsed.get("width", 0)) * int(_parsed.get("tile_w", 32))
	var level_h := int(_parsed.get("height", 0)) * int(_parsed.get("tile_h", 32))
	if level_w <= 0 or level_h <= 0:
		return
	var fill := ColorRect.new()
	fill.name = "Underfill"
	# `ink_world`, not `ground_shadow`: the shadow role is a mid-tone that each
	# world tints to taste, and in Sugarstorm it is hot pink - which painted a
	# bright stripe across the bottom of the screen instead of reading as depth.
	# ink_world is the near-black every theme defines for exactly this.
	fill.color = ThemeManager.get_color_value("ink_world")
	# Wide and deep enough to cover the widest viewport at the level's edges and
	# the tallest one below its floor, with room to spare - it costs one quad.
	fill.position = Vector2(-level_w, level_h)
	fill.size = Vector2(level_w * 3, UNDERFILL_DEPTH)
	fill.z_index = -50
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_world.add_child(fill)

func _spawn_entities() -> void:
	var registry := DataManager.get_dict("SPAWN_REGISTRY")
	for s in _parsed.get("spawns", []):
		var type := String(s["type"])
		if type == "player_spawn":
			spawn_point = Vector2(s["x"] + s["width"] * 0.5, s["y"] + s["height"])
			_player = PLAYER_SCENE.instantiate()
			_player.global_position = spawn_point
			_world.add_child(_player)
			continue
		var entry: Dictionary = registry.get(type, {})
		var scene_path := String(entry.get("scene", ""))
		if scene_path == "" or not ResourceLoader.exists(scene_path):
			continue
		var node: Node = load(scene_path).instantiate()
		# setup_from_spawn runs BEFORE _ready (so @export/id props are set in time).
		if node.has_method("setup_from_spawn"):
			node.setup_from_spawn(s)
		_world.add_child(node)

func _setup_camera() -> void:
	if _player == null:
		return
	_camera = Camera2D.new()
	_camera.name = "Camera"
	var tuning := DataManager.get_dict("CAMERA_TUNING")
	_camera.position_smoothing_enabled = true
	_camera.position_smoothing_speed = maxf(1.0, float(tuning.get("followLerp", 0.1)) * 50.0)
	var dz: Dictionary = tuning.get("deadzone", {"width": 200, "height": 100})
	_camera.drag_horizontal_enabled = true
	_camera.drag_vertical_enabled = true
	_camera.drag_left_margin = clampf((float(dz.get("width", 200)) * 0.5) / 480.0, 0.0, 0.9)
	_camera.drag_right_margin = _camera.drag_left_margin
	_camera.drag_top_margin = clampf((float(dz.get("height", 100)) * 0.5) / 270.0, 0.0, 0.9)
	_camera.drag_bottom_margin = _camera.drag_top_margin
	_camera.limit_left = 0
	_camera.limit_top = 0
	_camera.limit_right = int(_parsed["width"]) * int(_parsed["tile_w"])
	_camera.limit_bottom = int(_parsed["height"]) * int(_parsed["tile_h"])
	_player.add_child(_camera)
	_camera.make_current()

func _physics_process(delta: float) -> void:
	_check_pit_death()
	_update_shake(delta)

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause") and not is_math_challenge_active():
		_toggle_pause()

var _pause_overlay: CanvasLayer

## Pan the view so the crow sits below the maths board, and put it back after.
##
## The board is centred and roughly 380 tall; the crow was directly underneath
## it, so for the whole of every encounter a child could not see who they were.
## brand/BRAND_SYSTEM.md §8.3 asks for exactly this: move the camera before
## pausing, restore on close.
##
## A negative offset lifts the camera, which pushes the player down the screen -
## the camera keeps following him, so this survives the crow being anywhere in
## the level rather than assuming he is where a screenshot found him.
func _lift_camera_for_challenge(lifted: bool) -> void:
	if not is_instance_valid(_camera):
		return
	var to := -float(Config.ui("math_challenge/camera_lift", 150)) if lifted else 0.0
	var seconds := float(Config.ui("math_challenge/camera_lift_seconds", 0.28))
	_camera.create_tween().tween_property(_camera, "offset:y", to, seconds) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)

## Hide the on-screen controls while an overlay owns the screen. Visibility is
## the whole fix: a hidden TouchScreenButton does not take input.
func _set_touch_visible(shown: bool) -> void:
	if is_instance_valid(_touch):
		_touch.visible = shown and _touch_supported()

## The same condition TouchControls uses to decide whether it belongs on this
## device at all - so showing it back does not summon a d-pad onto a desktop.
func _touch_supported() -> bool:
	return DisplayServer.is_touchscreen_available() or OS.has_feature("web") or OS.has_feature("mobile")

func _toggle_pause() -> void:
	if is_instance_valid(_pause_overlay):
		return
	_pause_overlay = PAUSE_SCENE.instantiate()
	# Same reason as the maths board: the pads sit under the pause card and would
	# still take a thumb through it.
	_set_touch_visible(false)
	_pause_overlay.tree_exited.connect(func(): _set_touch_visible(true))
	add_child(_pause_overlay)
	get_tree().paused = true

func award_enemy_coins(amount: int) -> void:
	coin_count += amount
	EventBus.coins_changed.emit(coin_count)

# ─── Owl saved (the emotional payoff for doing the math) ──
## Streak accounting, per brand/BRAND_SYSTEM.md §10.2.
##
## **A wrong answer pauses the streak; it never resets it.** The count survives a
## miss and the flame dims to 40% until the next correct answer relights it. Only
## leaving the level clears it.
##
## This was implemented backwards at first - wrong answers zeroed the count, on
## the reasoning that a streak which cannot be lost is not a reward. That is a
## fine rule for an adult game and the wrong one here: it puts a punishment on
## the single most confidence-sensitive moment a child has, which is the one
## thing this product cannot afford. The doc had already made that call, in those
## words, and children replaying a level to protect a streak are children doing
## more maths - which is the entire mechanic.
func _on_answer_submitted(payload: Dictionary) -> void:
	if bool(payload.get("isCorrect", false)):
		streak += 1
		streak_paused = false
		EventBus.streak_changed.emit(streak, streak_paused)
		if streak >= int(Config.fx("streak/flame", 3)):
			_streak_toast()
		return

	if streak_paused:
		return  # already dimmed; a second miss changes nothing
	streak_paused = true
	EventBus.streak_changed.emit(streak, streak_paused)

## The top centre of the HUD is kept empty precisely so this reads as an event
## rather than as another readout. It appears, it says one thing, it leaves.
func _streak_toast() -> void:
	var layer := get_node_or_null("FX")
	if layer == null:
		return
	var hot := streak >= int(Config.fx("streak/hot", 5))
	var vw := float(ProjectSettings.get_setting("display/window/size/viewport_width"))
	var key := "fx.streak_on_fire" if hot else "fx.streak_multiplier"
	DopamineFX.number_fly_up(layer, Vector2(vw * 0.5, 96.0), TextManager.t(key, [streak]))
	AudioManager.play_event("milestone")

func _on_owl_saved() -> void:
	AudioManager.play_event("owl_saved")
	var layer := get_node_or_null("FX")
	if layer == null:
		return
	var vw := float(ProjectSettings.get_setting("display/window/size/viewport_width"))
	DopamineFX.burst(layer, Vector2(vw * 0.5, 200.0), ThemeManager.get_color_value("coin"), int(Config.fx("burst/owl_saved", 30)))
	var banner := Label.new()
	banner.text = TextManager.t("game.owl_saved")
	banner.add_theme_font_size_override("font_size", 44)
	banner.add_theme_color_override("font_color", ThemeManager.get_color_value("accent"))
	banner.add_theme_color_override("font_shadow_color", Color.BLACK)
	banner.add_theme_constant_override("shadow_offset_x", 3)
	banner.add_theme_constant_override("shadow_offset_y", 3)
	banner.anchor_right = 1.0
	banner.anchor_bottom = 1.0
	banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	banner.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	layer.add_child(banner)
	UiFx.elastic_entrance.call_deferred(banner)
	var tw := banner.create_tween()
	tw.tween_interval(0.9)
	tw.tween_property(banner, "modulate:a", 0.0, 0.4)
	tw.tween_callback(banner.queue_free)

# ─── Coins ────────────────────────────────────────────────
func collect_coin(coin: Node) -> void:
	if transitioning:
		return
	if _world and coin is Node2D:
		DopamineFX.burst(_world, coin.position, ThemeManager.get_color_value("coin"), int(Config.fx("burst/coin", 20)))
	coin.queue_free()
	coin_count += 1
	AudioManager.play_event("coin")
	EventBus.coins_changed.emit(coin_count)

# ─── Damage / death / respawn ─────────────────────────────
func hurt_player() -> void:
	if respawning or transitioning:
		return
	lives -= 1
	EventBus.lives_changed.emit(lives)
	EventBus.player_hurt.emit()
	AudioManager.play_event("hurt")
	_camera_shake(Config.fx("shake/duration", 0.15), Config.fx("shake/strength", 6.0))
	var flash := ThemeManager.get_color_value("danger_flash")
	flash.a = Config.fx("hurt_flash_alpha", 0.45)
	_screen_flash(flash, Config.fx("hurt_flash_duration", 0.2))
	if lives <= 0:
		player_die()
	else:
		respawn_player()

func player_die() -> void:
	respawning = true
	transitioning = true
	EventBus.player_died.emit()
	# Coins collected this level are lost (back to level-start count).
	coin_count = coins_at_level_start
	EventBus.coins_changed.emit(coin_count)
	if _player:
		_player.set_physics_process(false)
	_show_death_text()
	# Full level reload, mirroring Phaser's scene.restart(): coins and enemies
	# respawn, lives refill (handled by _load_level).
	get_tree().create_timer(Config.fx("death_beat", 0.8)).timeout.connect(
		_swap_level.bind(LevelManager.get_current_level_key()), CONNECT_ONE_SHOT)

func _show_death_text() -> void:
	# "Oops!" float-up (MathChallengeScene-era death text from GameScene.ts).
	var layer := get_node_or_null("FX")
	if layer == null:
		return
	var l := Label.new()
	l.text = TextManager.t("game.oops")
	l.add_theme_font_size_override("font_size", 48)
	l.add_theme_color_override("font_color", ThemeManager.get_color_value("death_text"))
	l.add_theme_color_override("font_shadow_color", Color.BLACK)
	l.add_theme_constant_override("shadow_offset_x", 3)
	l.add_theme_constant_override("shadow_offset_y", 3)
	l.anchor_right = 1.0
	l.anchor_bottom = 1.0
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	layer.add_child(l)
	var tw := l.create_tween().set_parallel(true)
	tw.tween_property(l, "position:y", -40.0, 0.6).set_trans(Tween.TRANS_QUAD)
	tw.tween_property(l, "modulate:a", 0.0, 0.8)
	tw.chain().tween_callback(l.queue_free)

func respawn_player() -> void:
	respawning = true
	_reset_player_to_spawn()
	_blink_invuln()

func _reset_player_to_spawn() -> void:
	if _player == null:
		return
	_player.velocity = Vector2.ZERO
	_player.get_motion_state()["vx"] = 0.0
	_player.get_motion_state()["vy"] = 0.0
	_player.global_position = spawn_point

func _blink_invuln() -> void:
	if _player == null:
		respawning = false
		return
	var sprite: Node = _player.get_node_or_null("Sprite")
	var tw := create_tween()
	for i in int(Config.fx("invuln_blinks", 5)):
		if sprite:
			tw.tween_property(sprite, "modulate:a", 0.3, 0.1)
			tw.tween_property(sprite, "modulate:a", 1.0, 0.1)
	tw.tween_callback(func():
		if sprite:
			sprite.modulate.a = 1.0
		respawning = false)

func _check_pit_death() -> void:
	if respawning or transitioning or _player == null or _parsed.is_empty():
		return
	var map_height := int(_parsed["height"]) * int(_parsed["tile_h"])
	if _player.global_position.y > map_height + int(Config.fx("pit_margin", 64)):
		hurt_player()

# ─── Doors / transitions ──────────────────────────────────
func transition_to_level(target_level: String) -> void:
	if transitioning:
		return
	transitioning = true
	if _player:
		_player.velocity = Vector2.ZERO
		_player.set_physics_process(false)
	LevelManager.transition_to(target_level)
	if target_level == "__complete__":
		AudioManager.stop_music()
		call_deferred("_show_completion_screen")
		return
	# Swap to the next level (deferred so we're outside the Area2D callback).
	call_deferred("_swap_level", target_level)

## Full-screen celebration when all levels are completed.
##
## What this replaced: a flat `primary` green fill, a 64px "Congratulations!",
## one 26px line reading "Owls saved: 19   Coins: 110", and two grey slabs. The
## single biggest reward moment in the game was a receipt on a coloured page.
##
## The numbers a child earned are now the largest thing on the screen and they
## roll up rather than appearing, because this screen exists to make the run feel
## like it was worth something (§10).
func _show_completion_screen() -> void:
	var layer := CanvasLayer.new()
	layer.name = "Completion"
	layer.layer = 15
	add_child(layer)
	AudioManager.play_event("level_complete")

	var root := Control.new()
	BrandTheme.apply(root)
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(root)
	root.add_child(ScreenBackdrop.new())

	# Scrim over the backdrop: the medals and the title need a floor that does
	# not change with whichever world the run ended in.
	var scrim := ColorRect.new()
	scrim.color = Color(ThemeManager.get_color_value("ink"), 0.35)
	scrim.set_anchors_preset(Control.PRESET_FULL_RECT)
	scrim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(scrim)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(center)
	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 18)
	center.add_child(col)

	var title := Label.new()
	title.text = TextManager.t("game.congratulations_title")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 62)
	title.add_theme_color_override("font_color", ThemeManager.get_color_value("coin"))
	title.add_theme_color_override("font_shadow_color", ThemeManager.get_color_value("ink"))
	title.add_theme_constant_override("shadow_offset_x", 4)
	title.add_theme_constant_override("shadow_offset_y", 5)
	col.add_child(title)

	col.add_child(_completion_medals())

	var again := BrandButton.make(TextManager.t("game.play_again"), BrandButton.Role.PRIMARY,
		func(): SceneRouter.goto("level_select"))
	again.custom_minimum_size.x = 320
	again.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	col.add_child(again)

	var menu := BrandButton.make(TextManager.t("game.back_to_menu"), BrandButton.Role.GHOST,
		func(): SceneRouter.goto("main_menu"))
	menu.custom_minimum_size.x = 320
	menu.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	col.add_child(menu)
	again.grab_focus.call_deferred()

	# Celebration bursts, staggered like the TS version.
	for i in int(Config.fx("completion_burst_count", 3)):
		get_tree().create_timer(0.3 + i * 0.3).timeout.connect(
			_completion_burst.bind(root, Vector2(480 + (i - 1) * 150, 160)), CONNECT_ONE_SHOT)

## Owls and coins as two counted-up medals rather than one line of small text.
func _completion_medals() -> HBoxContainer:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 22)
	var save := SaveManager.get_data()
	row.add_child(StatMedal.make(_owl_icon(), int(save.get("owlsSaved", 0)),
		TextManager.t("game.stat_owls"), "owl"))
	row.add_child(StatMedal.make(_coin_icon(), coin_count,
		TextManager.t("game.stat_coins"), "coin"))
	return row

func _owl_icon() -> Texture2D:
	return OwlRing.new()._load_icon()

func _coin_icon() -> Texture2D:
	var coin_texture := SpriteSheet.texture("coin")
	if coin_texture == null:
		return null
	# Frame 0 of the 3x3 spin sheet; the whole sheet in one box is gold noise.
	var frame := AtlasTexture.new()
	frame.atlas = coin_texture
	frame.region = Rect2(0, 0, 32, 32)
	return frame

func _completion_burst(parent: Node, pos: Vector2) -> void:
	if is_instance_valid(parent):
		DopamineFX.burst(parent, pos, ThemeManager.get_color_value("coin"), 24)

func _swap_level(target_level: String) -> void:
	if _world:
		# Vacate the "World" name now: the freed node lingers until end of frame
		# and would force the replacement to be auto-renamed (@World@2).
		_world.name = "WorldOld"
		_world.queue_free()
	_player = null
	await get_tree().process_frame
	_load_level(target_level)

# ─── Tier-2 FX ────────────────────────────────────────────
func _setup_fx_layer() -> void:
	var layer := CanvasLayer.new()
	layer.name = "FX"
	add_child(layer)
	_flash = ColorRect.new()
	_flash.color = Color.TRANSPARENT
	_flash.anchor_right = 1.0
	_flash.anchor_bottom = 1.0
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(_flash)

## Public screen flash (used for damage, muzzle flash, etc).
func flash_screen(color: Color, duration: float) -> void:
	_screen_flash(color, duration)

func _screen_flash(color: Color, duration: float) -> void:
	if _flash == null:
		return
	_flash.color = color
	var tw := create_tween()
	tw.tween_property(_flash, "color:a", 0.0, duration)

func _camera_shake(duration: float, strength: float) -> void:
	_shake_time = duration
	_shake_strength = strength

func _update_shake(delta: float) -> void:
	if _camera == null:
		return
	if _shake_time > 0.0:
		_shake_time -= delta
		var amp := _shake_strength * (_shake_time / maxf(0.001, Config.fx("shake/duration", 0.15)))
		_camera.offset = Vector2(randf_range(-amp, amp), randf_range(-amp, amp))
	elif _camera.offset != Vector2.ZERO:
		_camera.offset = Vector2.ZERO

func get_player() -> CharacterBody2D:
	return _player

# ─── Math challenge overlay ───────────────────────────────
var _math_challenge: CanvasLayer

func is_math_challenge_active() -> bool:
	return is_instance_valid(_math_challenge)

func get_math_challenge() -> CanvasLayer:
	return _math_challenge

func launch_math_challenge(problem: Dictionary, opts: Dictionary) -> void:
	if is_math_challenge_active():
		return
	_math_challenge = MATH_CHALLENGE_SCENE.instantiate()
	add_child(_math_challenge)
	_math_challenge.closed.connect(_on_challenge_closed)
	_set_touch_visible(false)
	_lift_camera_for_challenge(true)
	if _player:
		_player.set_physics_process(false)  # pause gameplay during the challenge
	_math_challenge.present(problem, opts)

## The lesson that precedes a challenge, hosted the same way and on the same
## terms: gameplay paused, camera lifted, touch controls away. `on_closed` gets
## {"tutorialId", "skipped"} and is where the caller launches the question the
## lesson was for.
##
## Guarded on the challenge slot rather than a slot of its own: a tutorial and a
## question are the same interruption as far as the level is concerned, and
## letting both open at once would put two boards on one screen.
var _math_tutorial: CanvasLayer

func is_math_tutorial_active() -> bool:
	return is_instance_valid(_math_tutorial)

func get_math_tutorial() -> CanvasLayer:
	return _math_tutorial

func launch_math_tutorial(tutorial: Dictionary, on_closed: Callable) -> void:
	if is_math_challenge_active() or is_math_tutorial_active():
		return
	_math_tutorial = MATH_TUTORIAL_SCENE.instantiate()
	add_child(_math_tutorial)
	_math_tutorial.closed.connect(func(payload: Dictionary):
		_math_tutorial = null
		_set_touch_visible(true)
		_lift_camera_for_challenge(false)
		if _player:
			_player.set_physics_process(true)
		if on_closed.is_valid():
			on_closed.call(payload)
	)
	_set_touch_visible(false)
	_lift_camera_for_challenge(true)
	if _player:
		_player.set_physics_process(false)
	_math_tutorial.present(tutorial)

func _on_challenge_closed() -> void:
	_math_challenge = null
	_set_touch_visible(true)
	_lift_camera_for_challenge(false)
	if _player:
		_player.set_physics_process(true)
