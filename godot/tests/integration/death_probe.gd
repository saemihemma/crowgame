extends Node
## Headless physics probe: dying reloads the level (Phaser scene.restart parity)
## — collected coins respawn, the player is back at spawn with full lives, and
## the coin counter is back to the level-start value.
##
## Run: godot --headless --path godot res://tests/integration/DeathProbe.tscn

const GAME_SCENE := preload("res://scenes/Game.tscn")
const MAX_FRAMES := 240

var _game: Node2D
var _frames := 0
var _phase := 0
var _coins_before := 0

func _ready() -> void:
	_game = GAME_SCENE.instantiate()
	_game.level_key = "level_01"
	add_child(_game)

func _count_coins() -> int:
	var n := 0
	var world: Node = _game.get_node_or_null("World")
	if world == null:
		return -1
	for c in world.get_children():
		if c.scene_file_path.get_file() == "Coin.tscn":
			n += 1
	return n

func _physics_process(_delta: float) -> void:
	_frames += 1
	match _phase:
		0:
			if _frames < 5:
				return
			_coins_before = _count_coins()
			if _coins_before <= 0:
				_finish(false, "no coins spawned")
				return
			# Simulate a collected coin + lethal hit.
			var world: Node = _game.get_node("World")
			for c in world.get_children():
				if c.scene_file_path.get_file() == "Coin.tscn":
					_game.collect_coin(c)
					break
			_game.lives = 1
			_game.respawning = false
			_game.hurt_player()
			_phase = 1
		1:
			# Wait for the 0.8s death beat + reload (~60 frames headroom).
			if _frames < 120:
				return
			var coins_now := _count_coins()
			var ok := true
			var msgs: Array[String] = []
			if coins_now != _coins_before:
				ok = false
				msgs.append("coins did not respawn (%d -> %d)" % [_coins_before, coins_now])
			if _game.lives != 3:
				ok = false
				msgs.append("lives not refilled (%d)" % _game.lives)
			if int(_game.coin_count) != int(_game.coins_at_level_start):
				ok = false
				msgs.append("coin counter not reset")
			if _game.get_player() == null:
				ok = false
				msgs.append("player missing after reload")
			if ok:
				print("[pass] death_probe: level reloaded on death (%d coins respawned, lives 3)" % coins_now)
			else:
				print("[FAIL] death_probe:")
				for m in msgs:
					print("        %s" % m)
			get_tree().quit(0 if ok else 1)

func _finish(ok: bool, msg: String) -> void:
	print(("[pass] " if ok else "[FAIL] ") + "death_probe: " + msg)
	get_tree().quit(0 if ok else 1)
