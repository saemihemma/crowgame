extends CharacterBody2D
## Player — ported from the retired Phaser build; this is now the only implementation on a CharacterBody2D.
## Velocity is computed by the pure PlayerMotion model (Tier-1 feel parity);
## move_and_slide() resolves collisions, and we write the resolved velocity back
## so a landing zeroes vy exactly like Phaser's blocked.down does.
## Animation mirrors Player.ts: walk while moving on ground, static pose
## otherwise (no jump anim in the source). Jump fires dust + SFX.
##
## SHAPE IS SEPARATE FROM ANIMATION, and is where the jump feel lives.
## brand/BRAND_SYSTEM.md §2.4 asks for jump_rise, apex, fall and land as
## distinct states; the only crow art that exists is a one-frame idle and a
## nine-frame walk, so there are no sprites to hold. The doc already says `land`
## is "code, not frames" -- squash, overshoot, settle -- and the same is true of
## the other three here: they are scale on the pose the game already has, driven
## by vertical velocity, with every number in player_base.json's `feel` block.
##
## Deliberately NOT a change to PlayerMotion. Reduced gravity at the apex would
## be a physics change nobody has specified (the doc's `apex` is an animation
## state at |vy| < 60, not a gravity scale), and PlayerMotion is parity-locked
## against golden fixtures. Shape costs nothing and is most of what "the jump
## feels good" actually means.

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

## Squash and stretch. `_shape` is where the sprite is now, `_shape_target` where
## the current state wants it; _apply_shape eases one toward the other so a state
## change reads as a move rather than a snap. A landing overrides both with a
## tween, because a landing is an event and the rest are conditions.
var _feel: Dictionary = {}
var _shape := Vector2.ONE
var _shape_target := Vector2.ONE
var _land_tween: Tween = null
var _was_on_floor := true

@onready var _sprite: AnimatedSprite2D = $Sprite

func _ready() -> void:
	add_to_group("player")
	_tuning = DataManager.get_dict("PLAYER_TUNING")
	if _tuning.is_empty():
		_tuning = {"accel": 600, "drag": 800, "maxSpeed": 160, "jumpVelocity": 475,
			"coyoteMs": 80, "jumpBufferMs": 100, "gravityScale": 1.0, "terminalVelocity": 500}
	_feel = _tuning.get("feel", {}) if _tuning.get("feel", null) is Dictionary else {}
	_build_animations()
	var combat := DataManager.get_dict("COMBAT_TUNING")
	_laser_speed = float(combat.get("laser_speed", 400))
	_laser_cooldown = float(combat.get("laser_cooldown_ms", 1000)) / 1000.0

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

	# Landing is read from the floor transition rather than from vy: vy is already
	# zeroed by move_and_slide() on the tick the crow touches down, so a
	# velocity test would miss the exact frame the squash belongs on.
	var on_floor := is_on_floor()
	if on_floor and not _was_on_floor:
		_land_squash()
	_was_on_floor = on_floor
	_update_shape(delta)

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

## The state's resting shape, from vertical velocity.
##
## Rise is tall and narrow, fall is the same idea softened, and apex is round --
## which is the whole trick: the crow visibly stops stretching for a moment at
## the top, and that moment is what reads as float. The threshold is the doc's
## own |vy| < 60.
func _update_shape(delta: float) -> void:
	if _sprite == null or _feel.is_empty():
		return
	var apex_vy := float(_feel.get("apexVy", 60.0))
	if is_on_floor():
		_shape_target = Vector2.ONE
	elif absf(velocity.y) < apex_vy:
		_shape_target = Vector2.ONE
	elif velocity.y < 0.0:
		_shape_target = Vector2(float(_feel.get("riseScaleX", 0.92)), float(_feel.get("riseScaleY", 1.12)))
	else:
		_shape_target = Vector2(float(_feel.get("fallScaleX", 0.95)), float(_feel.get("fallScaleY", 1.08)))

	# A landing tween owns the shape while it runs; easing underneath it would
	# fight it and flatten the overshoot into nothing.
	if _land_tween != null and _land_tween.is_running():
		return
	var rate: float = float(_feel.get("shapeLerp", 18.0)) * delta
	_shape = _shape.lerp(_shape_target, clampf(rate, 0.0, 1.0))
	_sprite.scale = _shape

## Squash, overshoot, settle -- the three beats §2.4 names, in its own timings.
func _land_squash() -> void:
	if _sprite == null or _feel.is_empty():
		return
	if _land_tween != null and _land_tween.is_valid():
		_land_tween.kill()
	var squash := Vector2(float(_feel.get("landSquashX", 1.18)), float(_feel.get("landSquashY", 0.82)))
	var overshoot := Vector2(float(_feel.get("landOvershootX", 0.96)), float(_feel.get("landOvershootY", 1.06)))
	var squash_s := float(_feel.get("landSquashMs", 80)) / 1000.0
	var settle_s := float(_feel.get("landSettleMs", 120)) / 1000.0
	_sprite.scale = squash
	_shape = squash
	_land_tween = create_tween()
	_land_tween.tween_property(_sprite, "scale", overshoot, squash_s).set_ease(Tween.EASE_OUT)
	_land_tween.tween_property(_sprite, "scale", Vector2.ONE, settle_s).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_land_tween.tween_callback(func(): _shape = Vector2.ONE)

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

func set_tuning(t: Dictionary) -> void:
	_tuning = t
