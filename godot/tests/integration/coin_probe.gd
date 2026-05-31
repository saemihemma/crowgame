extends Node
## Headless physics probe (Slice 5): confirms Area2D coin pickup actually fires
## against the CharacterBody2D player. Loads the Game, drops a fresh coin onto
## the player, runs frames, and asserts the coin count increased.
##
## Run: godot --headless --path godot res://tests/integration/CoinProbe.tscn

const GAME_SCENE := preload("res://scenes/Game.tscn")
const COIN_SCENE := preload("res://scenes/Coin.tscn")
const MAX_FRAMES := 30

var _game: Node2D
var _frames := 0
var _start_count := 0
var _placed := false

func _ready() -> void:
	_game = GAME_SCENE.instantiate()
	_game.level_key = "level_01"
	add_child(_game)

func _physics_process(_delta: float) -> void:
	_frames += 1
	# Let the level settle a couple of frames, then drop a coin on the player.
	if _frames == 3 and not _placed:
		var player: CharacterBody2D = _game.get_player()
		if player == null:
			print("[FAIL] coin_probe: no player")
			get_tree().quit(1)
			return
		_start_count = _game.coin_count
		var coin := COIN_SCENE.instantiate()
		coin.global_position = player.global_position - Vector2(0, 24)
		_game.get_node("World").add_child(coin)
		_placed = true
		return
	if _frames < MAX_FRAMES:
		return
	var ok: bool = int(_game.coin_count) > _start_count
	if ok:
		print("[pass] coin_probe: Area2D pickup fired (%d -> %d)" % [_start_count, _game.coin_count])
	else:
		print("[FAIL] coin_probe: coin not collected (%d -> %d)" % [_start_count, _game.coin_count])
	get_tree().quit(0 if ok else 1)
