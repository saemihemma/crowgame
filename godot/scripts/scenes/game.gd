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
const HUD_SCENE := preload("res://scenes/Hud.tscn")
const TOUCH_SCENE := preload("res://scenes/TouchControls.tscn")
const PAUSE_SCENE := preload("res://scenes/Pause.tscn")

const MAX_LIVES := 3

@export var level_key := ""

var _parsed: Dictionary = {}
var _player: CharacterBody2D
var _world: Node2D
var _camera: Camera2D

var coin_count := 0
var coins_at_level_start := 0
var lives := MAX_LIVES
var transitioning := false
var respawning := false
var spawn_point := Vector2.ZERO

# Tier-2 FX state
var _shake_time := 0.0
var _shake_strength := 0.0
var _flash: ColorRect

func _ready() -> void:
	coin_count = int(SaveManager.get_data().get("coins", 0))
	coins_at_level_start = coin_count
	_setup_fx_layer()
	EventBus.owl_saved.connect(_on_owl_saved)
	add_child(HUD_SCENE.instantiate())
	add_child(TOUCH_SCENE.instantiate())
	var key := level_key
	if key == "":
		key = LevelManager.get_current_level_key()
	if key == "":
		key = "level_01"
	LevelManager.set_current_level(key)
	_load_level(key)

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

	_world = Node2D.new()
	_world.name = "World"
	add_child(_world)
	_parsed = LevelLoader.build(_world, level)

	lives = MAX_LIVES
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

## Data-driven spawning: player_spawn is special (player + camera); every other
## object type is looked up in spawn_registry.json -> scene, which self-configures
## from the Tiled object via setup_from_spawn(spawn). New object type = new scene
## + one registry entry, no code here.
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

func _toggle_pause() -> void:
	if is_instance_valid(_pause_overlay):
		return
	_pause_overlay = PAUSE_SCENE.instantiate()
	add_child(_pause_overlay)
	get_tree().paused = true

func award_enemy_coins(amount: int) -> void:
	coin_count += amount
	EventBus.coins_changed.emit(coin_count)

# ─── Owl saved (the emotional payoff for doing the math) ──
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

## Full-screen celebration when all levels are completed (GameScene.ts
## showCompletionScreen, rebuilt with Godot UI + FX).
func _show_completion_screen() -> void:
	var layer := CanvasLayer.new()
	layer.name = "Completion"
	layer.layer = 15
	add_child(layer)
	AudioManager.play_event("level_complete")

	var bg := ColorRect.new()
	bg.color = ThemeManager.get_color_value("primary")
	bg.anchor_right = 1.0
	bg.anchor_bottom = 1.0
	layer.add_child(bg)

	var center := CenterContainer.new()
	center.anchor_right = 1.0
	center.anchor_bottom = 1.0
	bg.add_child(center)
	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 24)
	center.add_child(col)

	var title := Label.new()
	title.text = TextManager.t("game.congratulations_title")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 64)
	title.add_theme_color_override("font_color", ThemeManager.get_color_value("accent"))
	col.add_child(title)

	var stats := Label.new()
	var save := SaveManager.get_data()
	stats.text = TextManager.t("game.completion_stats", [int(save.get("owlsSaved", 0)), coin_count])
	stats.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	stats.add_theme_font_size_override("font_size", 26)
	col.add_child(stats)

	var again := Button.new()
	again.text = TextManager.t("game.play_again")
	again.custom_minimum_size = Vector2(280, 64)
	again.add_theme_font_size_override("font_size", 28)
	again.pressed.connect(func(): SceneRouter.goto("level_select"))
	col.add_child(again)
	var menu := Button.new()
	menu.text = TextManager.t("game.back_to_menu")
	menu.custom_minimum_size = Vector2(280, 56)
	menu.pressed.connect(func(): SceneRouter.goto("main_menu"))
	col.add_child(menu)
	again.grab_focus()

	# Celebration bursts, staggered like the TS version.
	for i in int(Config.fx("completion_burst_count", 3)):
		get_tree().create_timer(0.3 + i * 0.3).timeout.connect(
			_completion_burst.bind(bg, Vector2(480 + (i - 1) * 150, 160)), CONNECT_ONE_SHOT)

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
	if _player:
		_player.set_physics_process(false)  # pause gameplay during the challenge
	_math_challenge.present(problem, opts)

func _on_challenge_closed() -> void:
	_math_challenge = null
	if _player:
		_player.set_physics_process(true)
