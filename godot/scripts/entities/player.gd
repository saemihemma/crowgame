extends CharacterBody2D
## Player — Godot port of src/entities/Player.ts on a CharacterBody2D.
## Velocity is computed by the pure PlayerMotion model (Tier-1 feel parity);
## move_and_slide() resolves collisions, and we write the resolved velocity back
## so a landing zeroes vy exactly like Phaser's blocked.down does.
## Animation mirrors Player.ts: walk while moving on ground, static pose
## otherwise (no jump anim in the source). Jump fires dust + SFX.

@export var crow_texture_path := "res://assets/sprites/characters/crow2/crow3/crow1-64px-fixed.png"
@export var crow_walk_path := "res://assets/sprites/characters/crow2/crow3/crow-walk-64px-fixed.png"

const PROJECTILE_SCENE := preload("res://scenes/Projectile.tscn")
@onready var WALK_SPEED_THRESHOLD: float = Config.ui("player/walk_speed_threshold", 10.0)  # |vx| for walk anim (Player.ts)

var _tuning: Dictionary = {}
var _state: Dictionary = PlayerMotion.new_state()
var _facing := 1
var _was_jumping := false
var _shoot_cooldown := 0.0
var _laser_speed := 400.0
var _laser_cooldown := 1.0

@onready var _sprite: AnimatedSprite2D = $Sprite

func _ready() -> void:
	add_to_group("player")
	_tuning = DataManager.get_dict("PLAYER_TUNING")
	if _tuning.is_empty():
		_tuning = {"accel": 600, "drag": 800, "maxSpeed": 160, "jumpVelocity": 475,
			"coyoteMs": 80, "jumpBufferMs": 100, "gravityScale": 1.0, "terminalVelocity": 500}
	_build_animations()
	var combat := DataManager.get_dict("COMBAT_TUNING")
	_laser_speed = float(combat.get("laser_speed", 400))
	_laser_cooldown = float(combat.get("laser_cooldown_ms", 1000)) / 1000.0

func _build_animations() -> void:
	if _sprite == null:
		return
	var frames: SpriteFrames
	if ResourceLoader.exists(crow_walk_path):
		frames = SpriteSheet.build_frames(load(crow_walk_path), 64, 64, 9, 10.0, "walk")
	else:
		frames = SpriteFrames.new()
		frames.add_animation("walk")
	frames.add_animation("idle")
	frames.set_animation_loop("idle", false)
	if ResourceLoader.exists(crow_texture_path):
		frames.add_frame("idle", load(crow_texture_path))
	_sprite.sprite_frames = frames
	_sprite.play("idle")

func _physics_process(delta: float) -> void:
	var input := {
		"left": Input.is_action_pressed("move_left"),
		"right": Input.is_action_pressed("move_right"),
		"jump_just_pressed": Input.is_action_just_pressed("jump"),
		"jump_held": Input.is_action_pressed("jump"),
	}
	PlayerMotion.compute_velocity(_state, input, is_on_floor(), _tuning, delta)
	velocity = Vector2(float(_state["vx"]), float(_state["vy"]))
	move_and_slide()
	# Write resolved velocity back so collisions (landing/ceiling) reset feel state.
	_state["vx"] = velocity.x
	_state["vy"] = velocity.y

	if input["left"]:
		_facing = -1
	elif input["right"]:
		_facing = 1

	# Jump just happened this tick (PlayerMotion flips is_jumping on launch).
	var jumping_now := bool(_state["is_jumping"])
	if jumping_now and not _was_jumping:
		_on_jumped()
	_was_jumping = jumping_now

	_update_animation()

	_shoot_cooldown = maxf(0.0, _shoot_cooldown - delta)
	if Input.is_action_just_pressed("shoot") and _shoot_cooldown <= 0.0:
		_shoot()

func _update_animation() -> void:
	if _sprite == null:
		return
	_sprite.flip_h = _facing < 0
	if not is_on_floor():
		# Airborne: static pose (Player.ts shows the static 'crow' texture).
		if _sprite.animation != "idle":
			_sprite.play("idle")
	elif absf(velocity.x) > WALK_SPEED_THRESHOLD:
		if _sprite.animation != "walk":
			_sprite.play("walk")
	elif _sprite.animation != "idle":
		_sprite.play("idle")

func _on_jumped() -> void:
	AudioManager.play_sfx("player_jump")
	DopamineFX.burst(get_parent(), global_position + Vector2(0, -4), Color(0.9, 0.9, 0.85, 0.8), 8)

func _shoot() -> void:
	_shoot_cooldown = _laser_cooldown
	var proj := PROJECTILE_SCENE.instantiate()
	proj.global_position = global_position + Vector2(_facing * 20.0, -40.0)
	proj.setup(_facing, _laser_speed)
	get_parent().add_child(proj)
	AudioManager.play_sfx("laser_shoot")
	# Orange muzzle screen-flash (GameScene.ts shoot feedback).
	var game := _find_game()
	if game != null:
		game.flash_screen(Color(1.0, 0.667, 0.0, 0.25), 0.05)

func _find_game() -> Node:
	var n := get_parent()
	while n != null:
		if n.has_method("flash_screen"):
			return n
		n = n.get_parent()
	return null

## Test/feel hooks ----------------------------------------------------------
func get_motion_state() -> Dictionary:
	return _state

func set_tuning(t: Dictionary) -> void:
	_tuning = t
