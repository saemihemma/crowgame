extends Area2D
## Door — reusable level exit (Godot port of GameScene createDoor).
## 36-frame door sprite (idle frame 0; open 0..35 @24fps), pulsing glow, a
## 56x80 trigger zone. Opens its animation when the player is near (~100px) and
## triggers the level transition on contact.

const DOOR_TEXTURE := "res://assets/sprites/objects/door/door-36-runtime-88x96.png"
@onready var PROXIMITY: float = Config.ui("door/proximity", 100.0)

var target_level := ""
var _in_proximity := false
var _opened := false

@onready var _anim: AnimatedSprite2D = $Anim

func setup_from_spawn(s: Dictionary) -> void:
	position = Vector2(s["x"] + 16.0, s["y"])
	target_level = String(s.get("props", {}).get("target_level", ""))

func _ready() -> void:
	if ResourceLoader.exists(DOOR_TEXTURE):
		var tex: Texture2D = load(DOOR_TEXTURE)
		var frames := SpriteSheet.build_frames(tex, 88, 96, 36, 24.0, "open", false)
		frames.add_animation("idle")
		frames.set_animation_loop("idle", false)
		# Reuse the first frame for idle.
		var at := AtlasTexture.new()
		at.atlas = tex
		at.region = Rect2(0, 0, 88, 96)
		frames.add_frame("idle", at)
		_anim.sprite_frames = frames
		_anim.play("idle")
	# Pulsing glow (Tier-2 feel via Godot tween).
	var tw := create_tween().set_loops()
	tw.tween_property(_anim, "modulate:a", 1.0, 0.8).from(0.8).set_trans(Tween.TRANS_SINE)
	tw.tween_property(_anim, "modulate:a", 0.8, 0.8).set_trans(Tween.TRANS_SINE)
	body_entered.connect(_on_body_entered)

func _process(_delta: float) -> void:
	var game := _game()
	if game == null:
		return
	var player = game.get_player()
	if player == null:
		return
	var near := global_position.distance_to(player.global_position) < PROXIMITY
	if near and not _opened:
		_opened = true
		AudioManager.play_event("door")
		if _anim.sprite_frames and _anim.sprite_frames.has_animation("open"):
			_anim.play("open")
	elif not near and _opened:
		_opened = false
		_anim.play("idle")

func _on_body_entered(body: Node) -> void:
	if not body.is_in_group("player"):
		return
	var game := _game()
	if game != null:
		game.transition_to_level(target_level)

var _game_cache: Node

## Cached game lookup (the ancestor doesn't change after spawn) — avoids walking
## the parent chain every _process frame.
func _game() -> Node:
	if is_instance_valid(_game_cache):
		return _game_cache
	_game_cache = _find_game()
	return _game_cache

func _find_game() -> Node:
	var n := get_parent()
	while n != null:
		if n.has_method("transition_to_level"):
			return n
		n = n.get_parent()
	return null
