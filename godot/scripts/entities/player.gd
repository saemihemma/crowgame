extends CharacterBody2D
## Player — Godot port of src/entities/Player.ts on a CharacterBody2D.
## Velocity is computed by the pure PlayerMotion model (Tier-1 feel parity);
## move_and_slide() resolves collisions, and we write the resolved velocity back
## so a landing zeroes vy exactly like Phaser's blocked.down does.

@export var crow_texture_path := "res://assets/sprites/characters/crow2/crow3/crow1-64px-fixed.png"
@export var crow_walk_path := "res://assets/sprites/characters/crow2/crow3/crow-walk-64px-fixed.png"

const PROJECTILE_SCENE := preload("res://scenes/Projectile.tscn")

var _tuning: Dictionary = {}
var _state: Dictionary = PlayerMotion.new_state()
var _facing := 1
var _shoot_cooldown := 0.0
var _laser_speed := 400.0
var _laser_cooldown := 1.0

@onready var _sprite: Sprite2D = $Sprite

func _ready() -> void:
	add_to_group("player")
	_tuning = DataManager.get_dict("PLAYER_TUNING")
	if _tuning.is_empty():
		_tuning = {"accel": 600, "drag": 800, "maxSpeed": 160, "jumpVelocity": 475,
			"coyoteMs": 80, "jumpBufferMs": 100, "gravityScale": 1.0, "terminalVelocity": 500}
	if _sprite and ResourceLoader.exists(crow_texture_path):
		_sprite.texture = load(crow_texture_path)
	var combat := DataManager.get_dict("COMBAT_TUNING")
	_laser_speed = float(combat.get("laser_speed", 400))
	_laser_cooldown = float(combat.get("laser_cooldown_ms", 1000)) / 1000.0

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
	if _sprite:
		_sprite.flip_h = _facing < 0

	_shoot_cooldown = maxf(0.0, _shoot_cooldown - delta)
	if Input.is_action_just_pressed("shoot") and _shoot_cooldown <= 0.0:
		_shoot()

func _shoot() -> void:
	_shoot_cooldown = _laser_cooldown
	var proj := PROJECTILE_SCENE.instantiate()
	proj.global_position = global_position + Vector2(_facing * 20.0, -40.0)
	proj.setup(_facing, _laser_speed)
	get_parent().add_child(proj)

## Test/feel hooks ----------------------------------------------------------
func get_motion_state() -> Dictionary:
	return _state

func set_tuning(t: Dictionary) -> void:
	_tuning = t
