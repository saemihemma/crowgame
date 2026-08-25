extends Area2D
## Coin — reusable collectible (Godot port of GameScene spawnCoin/collectCoin).
## Spinning 9-frame animation (12 fps), 20x20 pickup body. On player overlap it
## notifies the Game, which increments the count and emits coins_changed.

const SPRITE_KEY := "coin"

@onready var _anim: AnimatedSprite2D = $Anim

func setup_from_spawn(s: Dictionary) -> void:
	position = Vector2(s["x"], s["y"])

func _ready() -> void:
	_anim.sprite_frames = SpriteSheet.frames(SPRITE_KEY)
	_anim.offset = SpriteSheet.anchor_offset(SPRITE_KEY)
	_anim.play("spin")
	body_entered.connect(_on_body_entered)

func _on_body_entered(body: Node) -> void:
	if not body.is_in_group("player"):
		return
	var game := _find_game()
	if game != null:
		game.collect_coin(self)
	else:
		queue_free()

func _find_game() -> Node:
	var n := get_parent()
	while n != null:
		if n.has_method("collect_coin"):
			return n
		n = n.get_parent()
	return null
