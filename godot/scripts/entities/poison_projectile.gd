extends Area2D
class_name PoisonProjectile
## PoisonProjectile — Spat by the Spitter Beetle enemy ("Eiturbjalla").
## Arcs through the air and turns into a temporary bubbling acid puddle upon landing
## that fades away over 1.8 seconds. Hörmann must jump over it or dodge it.

const SPIT_SPRITE_KEY := "poison_spit"

var velocity := Vector2.ZERO
var gravity := 600.0
var _is_puddle := false
var _puddle_timer := 1.8
var _max_puddle_time := 1.8

@onready var _sprite: AnimatedSprite2D = $Sprite

func setup(origin: Vector2, initial_vel: Vector2) -> void:
	position = origin
	velocity = initial_vel

func _ready() -> void:
	add_to_group("hazard")
	body_entered.connect(_on_body_entered)
	area_entered.connect(_on_area_entered)
	
	if _sprite != null and SpriteSheet.has_art(SPIT_SPRITE_KEY):
		var frames := SpriteSheet.frames(SPIT_SPRITE_KEY)
		if frames != null:
			_sprite.sprite_frames = frames
			_sprite.play("puddle")

func _physics_process(delta: float) -> void:
	if _is_puddle:
		_puddle_timer -= delta
		if _puddle_timer <= 0.0:
			queue_free()
			return
		# Fade away gradually
		var alpha := clampf(_puddle_timer / _max_puddle_time, 0.0, 1.0)
		modulate.a = alpha
	else:
		velocity.y += gravity * delta
		position += velocity * delta
		
		# If it falls below screen or travels for too long in air
		if position.y > 2000.0:
			queue_free()

func _on_body_entered(body: Node) -> void:
	if body.is_in_group("player"):
		_hurt_player(body)
	elif not _is_puddle and (body is TileMap or body is StaticBody2D or body.is_in_group("terrain")):
		_turn_to_puddle()

func _on_area_entered(area: Area2D) -> void:
	if area.is_in_group("player") or area.get_parent().is_in_group("player"):
		_hurt_player(area.get_parent())

func _turn_to_puddle() -> void:
	_is_puddle = true
	velocity = Vector2.ZERO
	if _sprite != null:
		_sprite.play("puddle")

func _hurt_player(player_node: Node) -> void:
	var game := _find_game()
	if game != null and game.has_method("hurt_player"):
		game.hurt_player()
	elif player_node != null and player_node.has_method("take_damage"):
		player_node.take_damage(1)

func _find_game() -> Node:
	var n := get_parent()
	while n != null:
		if n.has_method("hurt_player"):
			return n
		n = n.get_parent()
	return null
