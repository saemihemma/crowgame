extends CharacterBody2D
## Player — Godot port of src/entities/Player.ts on a CharacterBody2D.
## Velocity is computed by the pure PlayerMotion model (Tier-1 feel parity);
## move_and_slide() resolves collisions, and we write the resolved velocity back
## so a landing zeroes vy exactly like Phaser's blocked.down does.

@export var crow_texture_path := "res://assets/sprites/characters/crow2/crow3/crow1-64px-fixed.png"
@export var crow_walk_path := "res://assets/sprites/characters/crow2/crow3/crow-walk-64px-fixed.png"

var _tuning: Dictionary = {}
var _state: Dictionary = PlayerMotion.new_state()

@onready var _sprite: Sprite2D = $Sprite

func _ready() -> void:
	add_to_group("player")
	_tuning = DataManager.get_dict("PLAYER_TUNING")
	if _tuning.is_empty():
		_tuning = {"accel": 600, "drag": 800, "maxSpeed": 160, "jumpVelocity": 475,
			"coyoteMs": 80, "jumpBufferMs": 100, "gravityScale": 1.0, "terminalVelocity": 500}
	if _sprite and ResourceLoader.exists(crow_texture_path):
		_sprite.texture = load(crow_texture_path)

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

	if _sprite:
		if input["left"]:
			_sprite.flip_h = true
		elif input["right"]:
			_sprite.flip_h = false

## Test/feel hooks ----------------------------------------------------------
func get_motion_state() -> Dictionary:
	return _state

func set_tuning(t: Dictionary) -> void:
	_tuning = t
