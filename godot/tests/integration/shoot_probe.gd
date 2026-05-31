extends Node
## Headless physics probe: player shoots a laser that kills an enemy and awards
## coins. Positions the player just left of an enemy, fires, and checks the
## enemy is gone and coins increased.
##
## Run: godot --headless --path godot res://tests/integration/ShootProbe.tscn

const GAME_SCENE := preload("res://scenes/Game.tscn")
const MAX_FRAMES := 60

var _game: Node2D
var _frames := 0
var _enemy: Node2D
var _coins_before := 0
var _fired := false

func _ready() -> void:
	_game = GAME_SCENE.instantiate()
	_game.level_key = "level_01"
	add_child(_game)

func _physics_process(_delta: float) -> void:
	_frames += 1
	if _frames == 3 and not _fired:
		_enemy = _find_enemy()
		var player: CharacterBody2D = _game.get_player()
		if _enemy == null or player == null:
			_finish(false, "missing enemy or player")
			return
		_coins_before = _game.coin_count
		# Stand just left of the enemy, face right, fire.
		player.global_position = _enemy.global_position - Vector2(60, 0)
		player._facing = 1
		player._shoot()
		_fired = true
		return
	if _fired and _frames >= MAX_FRAMES:
		var killed: bool = not is_instance_valid(_enemy) or bool(_enemy.is_dead())
		var got_coins: bool = int(_game.coin_count) > _coins_before
		if killed and got_coins:
			_finish(true, "")
		else:
			_finish(false, "killed=%s coins(%d->%d)" % [str(killed), _coins_before, _game.coin_count])

func _finish(ok: bool, msg: String) -> void:
	if ok:
		print("[pass] shoot_probe: laser killed enemy, coins %d -> %d" % [_coins_before, _game.coin_count])
	else:
		print("[FAIL] shoot_probe: %s" % msg)
	get_tree().quit(0 if ok else 1)

func _find_enemy() -> Node2D:
	for c in _game.get_node("World").get_children():
		if c.scene_file_path.get_file() == "Enemy.tscn":
			return c
	return null
