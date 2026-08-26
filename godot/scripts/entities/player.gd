extends CharacterBody2D
## Player — ported from the retired Phaser build; this is now the only implementation on a CharacterBody2D.
## Velocity is computed by the pure PlayerMotion model (Tier-1 feel parity);
## move_and_slide() resolves collisions, and we write the resolved velocity back
## so a landing zeroes vy exactly like Phaser's blocked.down does.
## Animation mirrors Player.ts: walk while moving on ground, static pose
## otherwise (no jump anim in the source). Jump fires dust + SFX.

const IDLE_SPRITE_KEY := "crow_idle"
const WALK_SPRITE_KEY := "crow_walk"

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
@onready var _body: CollisionShape2D = $CollisionShape2D

func _ready() -> void:
	add_to_group("player")
	_size_body()
	_tuning = DataManager.get_dict("PLAYER_TUNING")
	if _tuning.is_empty():
		_tuning = {"accel": 600, "drag": 800, "maxSpeed": 160, "jumpVelocity": 475,
			"coyoteMs": 80, "jumpBufferMs": 100, "gravityScale": 1.0, "terminalVelocity": 500}
	_build_animations()
	var combat := DataManager.get_dict("COMBAT_TUNING")
	_laser_speed = float(combat.get("laser_speed", 400))
	_laser_cooldown = float(combat.get("laser_cooldown_ms", 1000)) / 1000.0

## Fit the collider to the drawing, from sprite_spec.json.
##
## The scene used to state it: a 40x56 box at y = -28. The crow is drawn 47-51px
## tall in a 64px frame, so up to 9 of those 56 pixels were above its head —
## which is why a jump stopped a visible gap short of every platform's underside.
## The number was never measured; it was half the frame height, the same literal
## SpriteSheet already exists to keep out of scene files.
##
## A fresh shape rather than resizing the scene's: sub-resources are shared
## between instances of a PackedScene, and this is the kind of edit that quietly
## reaches through one.
func _size_body() -> void:
	var box := SpriteSheet.body_box(WALK_SPRITE_KEY)
	if _body == null or box == Vector2.ZERO:
		return
	var shape := RectangleShape2D.new()
	shape.size = box
	_body.shape = shape
	# Grown upward from the feet, which sit on the node origin.
	_body.position = Vector2(0.0, -box.y * 0.5)


func _build_animations() -> void:
	if _sprite == null:
		return
	var frames := SpriteSheet.frames(WALK_SPRITE_KEY)
	frames.add_animation("idle")
	frames.set_animation_loop("idle", false)
	var idle_tex := SpriteSheet.texture(IDLE_SPRITE_KEY)
	if idle_tex != null:
		frames.add_frame("idle", idle_tex)
	_sprite.sprite_frames = frames
	# Anchor derived from the registry, never a literal — see SpriteSheet.anchor_offset.
	_sprite.offset = SpriteSheet.anchor_offset(WALK_SPRITE_KEY, SpriteSheet.grounding_sink())
	_sprite.play("idle")

func _physics_process(delta: float) -> void:
	var input := {
		"left": Input.is_action_pressed("move_left"),
		"right": Input.is_action_pressed("move_right"),
		"jump_just_pressed": Input.is_action_just_pressed("jump"),
		"jump_held": Input.is_action_pressed("jump"),
	}
	var was_on_floor := is_on_floor()
	PlayerMotion.compute_velocity(_state, input, was_on_floor, _tuning, delta)
	velocity = Vector2(float(_state["vx"]), float(_state["vy"]))
	# Captured before move_and_slide resolves the collision, which zeroes vy on a
	# landing -- so this is the speed the crow actually hit the ground at.
	var fall_speed := velocity.y
	move_and_slide()
	# Write resolved velocity back so collisions (landing/ceiling) reset feel state.
	_state["vx"] = velocity.x
	_state["vy"] = velocity.y

	# The threshold lives in data/tuning/fx_tuning.json, like every other motion
	# and FX figure -- it shipped as a bare const for one commit, in the file whose
	# own README rule is that magic numbers do not live in .gd.
	if not was_on_floor and is_on_floor() \
			and fall_speed >= float(Config.fx("land_min_fall_speed", 220.0)):
		AudioManager.play_event("land")

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
	AudioManager.play_event("jump")
	var dust := ThemeManager.get_color_value("dust")
	dust.a = Config.fx("dust_alpha", 0.8)
	DopamineFX.burst(get_parent(), global_position + Vector2(0, -4), dust, int(Config.fx("burst/jump_dust", 8)))

func _shoot() -> void:
	_shoot_cooldown = _laser_cooldown
	var proj := PROJECTILE_SCENE.instantiate()
	proj.global_position = global_position + Vector2(_facing * 20.0, -40.0)
	proj.setup(_facing, _laser_speed)
	get_parent().add_child(proj)
	AudioManager.play_event("shoot")
	# Muzzle screen-flash (GameScene.ts shoot feedback) — color from theme.
	var game := _find_game()
	if game != null:
		var muzzle := ThemeManager.get_color_value("muzzle")
		muzzle.a = Config.fx("muzzle_flash_alpha", 0.25)
		game.flash_screen(muzzle, Config.fx("muzzle_flash_duration", 0.05))

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

