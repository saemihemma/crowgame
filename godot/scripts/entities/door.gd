extends Area2D
## Door — reusable level exit (Godot port of GameScene createDoor).
## 36-frame door sprite (idle frame 0; open 0..35 @24fps), pulsing glow, a
## 56x80 trigger zone. Opens its animation when the player is near (~100px) and
## triggers the level transition on contact.
##
## Unless the owls are still in chains. The door does not decide that - Game owns
## the count and answers door_is_locked() - but the door is where the player finds
## out, so a locked one keeps its animation shut and calls Game.refuse_door()
## instead of transitioning.

const SPRITE_KEY := "door"
@onready var PROXIMITY: float = Config.ui("door/proximity", 100.0)

## How long before a shut door will say the same thing again. Long enough that
## standing against it is not a stream of cards, short enough that a child who
## wandered off and came back gets an answer rather than silence.
const REFUSE_COOLDOWN := 2.0

var target_level := ""
var _opened := false
## Contact is polled rather than taken straight off body_entered, because
## body_entered fires ONCE. A child who reaches a locked door, frees the last owl
## from where they are standing and never steps out of the trigger would
## otherwise be sealed in a doorway that had already opened.
var _player_inside := false
var _refuse_cooldown := 0.0

@onready var _anim: AnimatedSprite2D = $Anim

func setup_from_spawn(s: Dictionary) -> void:
	position = Vector2(s["x"] + 16.0, s["y"])
	target_level = String(s.get("props", {}).get("target_level", ""))

func _ready() -> void:
	var tex := SpriteSheet.texture(SPRITE_KEY)
	if tex != null:
		var e := SpriteSheet.entry(SPRITE_KEY)
		var frames := SpriteSheet.frames(SPRITE_KEY)
		frames.add_animation("idle")
		frames.set_animation_loop("idle", false)
		# Reuse the first frame for idle.
		var at := AtlasTexture.new()
		at.atlas = tex
		at.region = Rect2(0, 0, int(e.get("frameWidth", 88)), int(e.get("frameHeight", 96)))
		frames.add_frame("idle", at)
		_anim.sprite_frames = frames
		# A door is mounted on the ground, not standing on it: no grounding sink.
		_anim.offset = SpriteSheet.anchor_offset(SPRITE_KEY)
		_anim.play("idle")
	# Pulsing glow (Tier-2 feel via Godot tween).
	var tw := create_tween().set_loops()
	tw.tween_property(_anim, "modulate:a", 1.0, 0.8).from(0.8).set_trans(Tween.TRANS_SINE)
	tw.tween_property(_anim, "modulate:a", 0.8, 0.8).set_trans(Tween.TRANS_SINE)
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)

func _process(delta: float) -> void:
	_refuse_cooldown = maxf(0.0, _refuse_cooldown - delta)
	var game := _game()
	if game == null:
		return
	var player = game.get_player()
	if player == null:
		return
	# No has_method guard: the only node that answers transition_to_level is
	# Game, and a Game that lost this method should fail loudly rather than
	# quietly hand back every locked door in the build.
	var locked: bool = game.door_is_locked()
	var near := global_position.distance_to(player.global_position) < PROXIMITY
	# A locked door does not open its animation either. The invitation and the
	# permission are the same fact, and a door that swings wide and then refuses
	# contact is a worse message than one that stays shut.
	if near and not locked and not _opened:
		_opened = true
		AudioManager.play_event("door")
		if _anim.sprite_frames and _anim.sprite_frames.has_animation("open"):
			_anim.play("open")
	elif (not near or locked) and _opened:
		_opened = false
		_anim.play("idle")

	if not _player_inside:
		return
	if locked:
		if _refuse_cooldown <= 0.0:
			_refuse_cooldown = REFUSE_COOLDOWN
			game.refuse_door()
		return
	game.transition_to_level(target_level)

func _on_body_entered(body: Node) -> void:
	if body.is_in_group("player"):
		_player_inside = true

func _on_body_exited(body: Node) -> void:
	if body.is_in_group("player"):
		_player_inside = false
		# Walking away and coming back is a fresh question, so it gets a fresh
		# answer rather than the tail of the last cooldown.
		_refuse_cooldown = 0.0

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
