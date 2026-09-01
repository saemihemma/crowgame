extends Area2D
class_name PoisonProjectile
## PoisonProjectile — Spat by the Spitter Beetle enemy ("Eiturbjalla").
## Arcs through the air and turns into a temporary bubbling acid puddle upon landing
## that fades away over 1.8 seconds. Hörmann must jump over it or dodge it.

const SPIT_SPRITE_KEY := "poison_spit"

var velocity := Vector2.ZERO
## NOT `gravity`. Area2D has a native `gravity` property (its own gravity
## override for bodies inside it), so `var gravity` was a REDEFINITION and
## GDScript refuses to compile the whole file over it -- which meant this script
## never loaded, PoisonProjectile.tscn could not be instantiated, and the spitter
## beetle's whole attack was dead in every build. Silent, because nothing spawns
## a spitter in a test and a failed script load is a log line rather than a
## crash. Found while wiring the puddle's sound; renamed rather than shadowed.
var fall_accel := 600.0
var _is_puddle := false
var _bubble: AudioStreamPlayer2D
var _bubble_base_db := 0.0
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
		# The bubbling fades with the sprite rather than cutting at the end, so
		# "it is going" and "it is gone" are two different sounds.
		if is_instance_valid(_bubble):
			_bubble.volume_db = linear_to_db(clampf(alpha, 0.0001, 1.0)) + _bubble_base_db
	else:
		velocity.y += fall_accel * delta
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
	# Two sounds, and they say different things. `spit_land` is the event -- the
	# blob has arrived and there is now something here. The bubble loop is the
	# STATE, and it is the useful one: it says "still dangerous" for as long as
	# the puddle lasts and then stops, so a child who is looking at the far side
	# of the screen still knows when the ground is theirs again.
	AudioManager.play_event_at("spit_land", self)
	_bubble = AudioManager.attach_loop("amb_puddle", self)
	if is_instance_valid(_bubble):
		_bubble_base_db = _bubble.volume_db

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
