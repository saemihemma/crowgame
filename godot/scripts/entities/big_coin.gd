extends Area2D
class_name BigCoin
## One of the three big coins hidden in a level.
##
## Not a bigger coin. An ordinary coin drops into a lifetime purse that only ever
## goes up, which is a fine thing to collect and a useless thing to MEASURE - "412
## of 530" tells a six-year-old nothing and barely moves. Three per level is
## countable on one hand, and it is the same vocabulary as the owl pips on the
## HUD ring and the locked-door card: a small row of things you either have or do
## not.
##
## Two rules that make it work:
##
## 1. It only counts if the level is finished. Picking one up and then dying puts
##    it back, because death reloads the level and a run is a run. That is where
##    the tension lives, and it is why the HUD shows this run's pips separately
##    from what is banked.
## 2. One you have already banked comes back as a GHOST - darkened, ringed in
##    gold, no collider. You walk through it. A child returning to a level can see
##    at a glance which one they never found, which is the entire reason to come
##    back.
##
## Identity is an explicit `coin_id` from the level spec, never a spawn index: an
## index means moving or reordering a coin silently wipes a child's record.

const SPRITE_KEY := "big_coin"
## The ghost's ring, measured from the centre of a 64px frame.
const GHOST_RING_RADIUS := 25.0
const GHOST_RING_WIDTH := 3.0
## The ring is the only bright thing in the ghost, and it competes with a busy
## world; at 0.55 it sank into a dark cave wall in the first capture.
const GHOST_RING_ALPHA := 0.72
## How much of the art survives in the ghost. Enough that the silhouette still
## reads as this coin, little enough that it never looks collectable.
const GHOST_TINT := 0.30
const GHOST_ALPHA := 0.42

var coin_id := ""
var banked := false

@onready var _anim: AnimatedSprite2D = $Anim

func setup_from_spawn(s: Dictionary) -> void:
	position = Vector2(s["x"], s["y"])
	coin_id = String(s.get("props", {}).get("coin_id", ""))

func _ready() -> void:
	_anim.sprite_frames = SpriteSheet.frames(SPRITE_KEY)
	_anim.offset = SpriteSheet.anchor_offset(SPRITE_KEY)
	banked = SaveManager.has_big_coin(LevelManager.get_current_level_key(), coin_id)
	if banked:
		_become_ghost()
		return
	_anim.play("spin")
	body_entered.connect(_on_body_entered)

## Already yours. Stop spinning on a single frame, drop to a dark tint of its own
## art, and stop existing as far as the player's body is concerned.
##
## Drawn from the SAME art rather than from a second asset, so replacing the coin
## sheet gets the ghost for free - see sprite_spec.json's `bonus_pickup` notes.
func _become_ghost() -> void:
	if _anim.sprite_frames != null and _anim.sprite_frames.has_animation("spin"):
		_anim.animation = "spin"
		_anim.frame = 0
	var coin := ThemeManager.get_color_value("coin")
	var ink := ThemeManager.get_color_value("ink")
	_anim.modulate = Color(ink.lerp(coin, GHOST_TINT), GHOST_ALPHA)
	# monitoring, not just an unconnected signal: an Area2D that still reports
	# overlaps is one bug away from awarding a coin the child already has.
	monitoring = false
	queue_redraw()

func _draw() -> void:
	if not banked:
		return
	# The empty socket, in the same gold. Same idea as the pips on the locked-door
	# card: the outline says "one belongs here", and having it is the fill.
	draw_arc(Vector2.ZERO, GHOST_RING_RADIUS, 0, TAU, 40,
		Color(ThemeManager.get_color_value("coin"), GHOST_RING_ALPHA), GHOST_RING_WIDTH)

func _on_body_entered(body: Node) -> void:
	if banked or not body.is_in_group("player"):
		return
	var game := _find_game()
	if game != null:
		game.collect_big_coin(self)

func _find_game() -> Node:
	var n := get_parent()
	while n != null:
		if n.has_method("collect_big_coin"):
			return n
		n = n.get_parent()
	return null
