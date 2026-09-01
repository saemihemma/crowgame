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
	_game.level_key = _level_with("enemy")
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

## FIND a level that has the thing this probe is about, rather than naming one.
##
## This probe used to hardcode level_01, which worked while every level held a
## bit of everything. The levels are zone acts now -- one new verb per zone -- so
## level_01 is Emberwood I and holds no enemy at all, and a hardcoded key made
## the probe fail for looking in the wrong place rather than for finding a bug.
func _level_with(object_type: String) -> String:
	for entry in LevelManager.get_levels():
		var key := String((entry as Dictionary).get("key", ""))
		var path := "res://%s" % LevelManager.map_file(key)
		if not FileAccess.file_exists(path):
			continue
		var f := FileAccess.open(path, FileAccess.READ)
		var level: Variant = JSON.parse_string(f.get_as_text())
		f.close()
		if not (level is Dictionary):
			continue
		for layer in (level as Dictionary).get("layers", []):
			if String((layer as Dictionary).get("type", "")) != "objectgroup":
				continue
			for obj in (layer as Dictionary).get("objects", []):
				if String((obj as Dictionary).get("type", "")) == object_type:
					return key
	return ""
