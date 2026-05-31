extends Area2D
## Coin — reusable collectible (Godot port of GameScene spawnCoin/collectCoin).
## Spinning 9-frame animation (12 fps), 20x20 pickup body. On player overlap it
## notifies the Game, which increments the count and emits coins_changed.

const COIN_TEXTURE := "res://assets/sprites/ui/coin/coinsprite-runtime-32.png"

@onready var _anim: AnimatedSprite2D = $Anim

func _ready() -> void:
	if ResourceLoader.exists(COIN_TEXTURE):
		_anim.sprite_frames = SpriteSheet.build_frames(load(COIN_TEXTURE), 32, 32, 9, 12.0, "spin")
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
