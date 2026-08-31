extends CharacterBody2D
## Enemy (Cockroach) — Godot port of Cockroach.ts patrol behavior.
## Constant-speed patrol, reverse on walls and at platform edges (raycast probe
## one tile ahead at foot level), flip to face direction. Player contact hurts.
## Killed (by a projectile, later slice) awards coins.

const SPRITE_KEY := "cockroach"

@export var enemy_id := "cockroach_basic"

var definition: Dictionary = {}
var speed := 40.0
var coin_reward := 2
var _dir := -1
var _dead := false
var _skitter: AudioStreamPlayer2D

@onready var _sprite: Node = $Sprite
@onready var _edge_ray: RayCast2D = $EdgeRay
@onready var _hitbox: Area2D = $Hitbox

func setup_from_spawn(s: Dictionary) -> void:
	position = Vector2(s["x"] + s["width"] * 0.5, s["y"] + s["height"])
	enemy_id = String(s.get("props", {}).get("enemy_id", enemy_id))

func _ready() -> void:
	add_to_group("enemy")
	definition = _lookup(enemy_id)
	speed = float(definition.get("speed", 40))
	coin_reward = int(definition.get("coinReward", 2))
	if _sprite is AnimatedSprite2D:
		var frames := SpriteSheet.frames(SPRITE_KEY)
		if frames != null:
			_sprite.sprite_frames = frames
			var anim_name := frames.get_animation_names()[0] if frames.get_animation_names().size() > 0 else "default"
			_sprite.play(anim_name)
		_sprite.offset = SpriteSheet.anchor_offset(SPRITE_KEY, SpriteSheet.grounding_sink())
	elif _sprite is Sprite2D:
		var tex := SpriteSheet.texture(SPRITE_KEY)
		if tex != null:
			_sprite.texture = tex
		_sprite.offset = SpriteSheet.anchor_offset(SPRITE_KEY, SpriteSheet.grounding_sink())
	_hitbox.body_entered.connect(_on_body_entered)
	# THE SKITTER. A cockroach is heard before it is seen: attach_loop mixes it
	# by distance and pan against the level camera, so it arrives from the side
	# it is actually on and grows as the crow closes. For a five-year-old this is
	# not flavour, it is fairness -- a patrol coming the other way round a ledge
	# is otherwise a hit nothing warned about. It dies with the node, which is
	# also why a dead roach goes quiet without anyone stopping it.
	_skitter = AudioManager.attach_loop("amb_roach", self)

func _physics_process(delta: float) -> void:
	if _dead:
		return
	if not is_on_floor():
		velocity.y += 800.0 * delta
	else:
		velocity.y = 0.0
	if is_on_wall():
		_dir = -_dir
	# Edge detection: probe one tile ahead at foot level; reverse if no ground.
	_edge_ray.position.x = _dir * float(Config.ui("enemy/edge_probe_x", 28.0))
	_edge_ray.force_raycast_update()
	if is_on_floor() and not _edge_ray.is_colliding():
		_dir = -_dir
	velocity.x = _dir * speed
	move_and_slide()
	_sprite.flip_h = _dir < 0

func kill() -> void:
	if _dead:
		return
	_dead = true
	_hitbox.set_deferred("monitoring", false)
	# The skitter stops on the hit, not on the queue_free two tenths later: a
	# roach that goes on walking after it bursts is the one thing the loop must
	# never say.
	AudioManager.detach_loop(_skitter)
	AudioManager.play_event_at("enemy_defeat", self)
	# Death burst + "+N" coin fly-up (GameScene.killEnemy feedback).
	var fx_parent := get_parent()
	if fx_parent != null:
		DopamineFX.burst(fx_parent, global_position + Vector2(0, -24), ThemeManager.get_color_value("enemy_pop"), 18)
		DopamineFX.number_fly_up(fx_parent, global_position + Vector2(-10, -52), "+%d" % coin_reward)
	var game := _find_game()
	if game != null and game.has_method("award_enemy_coins"):
		game.award_enemy_coins(coin_reward)
	var tw := create_tween().set_parallel(true)
	tw.tween_property(_sprite, "modulate:a", 0.0, 0.2)
	tw.tween_property(_sprite, "scale", Vector2(0.5, 0.5), 0.2)
	tw.chain().tween_callback(queue_free)

func is_dead() -> bool:
	return _dead

func _on_body_entered(body: Node) -> void:
	if _dead or not body.is_in_group("player"):
		return
	var game := _find_game()
	if game != null:
		game.hurt_player()

func _find_game() -> Node:
	var n := get_parent()
	while n != null:
		if n.has_method("hurt_player"):
			return n
		n = n.get_parent()
	return null

func _lookup(id: String) -> Dictionary:
	var reg: Variant = DataManager.get_data("ENEMY_REGISTRY")
	var list: Array = reg["enemies"] if (reg is Dictionary and reg.has("enemies")) else (reg if reg is Array else [])
	for e in list:
		if String(e.get("id", "")) == id:
			return e
	return {}
