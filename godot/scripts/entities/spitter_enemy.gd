extends CharacterBody2D
class_name SpitterEnemy
## SpitterEnemy ("Eiturbjalla") — Toxic armored beetle NPC/Enemy.
## Periodically telegraphs and spits green arcing poison blobs that land and
## turn into temporary fading acid hazards that Hörmann must dodge.

const SPRITE_KEY := "spitter_beetle"
const POISON_SCENE := preload("res://scenes/PoisonProjectile.tscn")

@export var enemy_id := "spitter_beetle"
@export var spit_interval := 3.2
@export var spit_speed := 220.0

var speed := 25.0
var coin_reward := 3
var _dir := -1
var _dead := false
var _spit_timer := 2.0
var _is_charging := false

@onready var _sprite: Node = $Sprite
@onready var _edge_ray: RayCast2D = $EdgeRay
@onready var _hitbox: Area2D = $Hitbox

func setup_from_spawn(s: Dictionary) -> void:
	position = Vector2(s["x"] + s["width"] * 0.5, s["y"] + s["height"])
	enemy_id = String(s.get("props", {}).get("enemy_id", enemy_id))

func _ready() -> void:
	add_to_group("enemy")
	var tex := SpriteSheet.texture(SPRITE_KEY)
	if tex != null and _sprite is Sprite2D:
		_sprite.texture = tex
	elif tex != null and _sprite is AnimatedSprite2D:
		var frames := SpriteSheet.frames(SPRITE_KEY)
		if frames != null:
			_sprite.sprite_frames = frames
			_sprite.play("idle")
	if _sprite != null:
		_sprite.offset = SpriteSheet.anchor_offset(SPRITE_KEY, SpriteSheet.grounding_sink())
	_hitbox.body_entered.connect(_on_body_entered)

func _physics_process(delta: float) -> void:
	if _dead:
		return
		
	if not is_on_floor():
		velocity.y += 800.0 * delta
	else:
		velocity.y = 0.0

	_spit_timer -= delta
	if _spit_timer <= 0.6 and not _is_charging:
		_telegraph_spit()
	
	if _spit_timer <= 0.0:
		_spit_poison()
		_spit_timer = spit_interval

	# Patrol movement when not charging spit
	if not _is_charging:
		if is_on_wall():
			_dir = -_dir
		if _edge_ray != null:
			_edge_ray.position.x = _dir * 28.0
			_edge_ray.force_raycast_update()
			if is_on_floor() and not _edge_ray.is_colliding():
				_dir = -_dir
		velocity.x = _dir * speed
	else:
		velocity.x = 0.0

	move_and_slide()
	if _sprite != null:
		_sprite.flip_h = _dir < 0

func _telegraph_spit() -> void:
	_is_charging = true
	var tw := create_tween()
	tw.tween_property(_sprite, "modulate", Color(0.4, 1.4, 0.4, 1.0), 0.5)

func _spit_poison() -> void:
	_is_charging = false
	if _sprite != null:
		_sprite.modulate = Color.WHITE
		
	AudioManager.play_event("jump") # spit whoosh sound
	var spit: Area2D = POISON_SCENE.instantiate()
	var spawn_pos := global_position + Vector2(_dir * 20.0, -20.0)
	var initial_velocity := Vector2(_dir * spit_speed, -180.0)
	spit.setup(spawn_pos, initial_velocity)
	
	var parent := get_parent()
	if parent != null:
		parent.add_child(spit)

func kill() -> void:
	if _dead:
		return
	_dead = true
	_hitbox.set_deferred("monitoring", false)
	AudioManager.play_event("enemy_defeat")
	var fx_parent := get_parent()
	if fx_parent != null:
		DopamineFX.burst(fx_parent, global_position + Vector2(0, -24), Color(0.2, 0.9, 0.3), 20)
		DopamineFX.number_fly_up(fx_parent, global_position + Vector2(-10, -52), "+%d" % coin_reward)
	var game := _find_game()
	if game != null and game.has_method("award_enemy_coins"):
		game.award_enemy_coins(coin_reward)
	var tw := create_tween().set_parallel(true)
	tw.tween_property(_sprite, "modulate:a", 0.0, 0.2)
	tw.tween_property(_sprite, "scale", Vector2(0.5, 0.5), 0.2)
	tw.chain().tween_callback(queue_free)

func _on_body_entered(body: Node) -> void:
	if _dead or not body.is_in_group("player"):
		return
	var game := _find_game()
	if game != null and game.has_method("hurt_player"):
		game.hurt_player()

func _find_game() -> Node:
	var n := get_parent()
	while n != null:
		if n.has_method("hurt_player"):
			return n
		n = n.get_parent()
	return null
