extends Node
## Headless physics integration probe (Slice 4): loads the real Game scene with
## level_01, runs physics frames, and asserts the crow falls and lands on the
## ground tile (is_on_floor, resting near the spawn's feet row). Unit tests can't
## advance physics, so this runs as its own scene and self-quits with an exit code.
##
## Run: godot --headless --path godot res://tests/integration/LandProbe.tscn

const GAME_SCENE := preload("res://scenes/Game.tscn")
const MAX_FRAMES := 150

var _game: Node2D
var _frames := 0

func _ready() -> void:
	_game = GAME_SCENE.instantiate()
	_game.level_key = "level_01"
	add_child(_game)

func _physics_process(_delta: float) -> void:
	_frames += 1
	if _frames < MAX_FRAMES:
		return
	var ok := true
	var msgs: Array[String] = []
	var player: CharacterBody2D = _game.get_player()
	if player == null:
		ok = false
		msgs.append("player did not spawn")
	else:
		var y := player.global_position.y
		if not player.is_on_floor():
			ok = false
			msgs.append("player not on floor after %d frames (y=%.1f)" % [_frames, y])
		# Feet should rest at the top of the ground row (~512), within a tile.
		if absf(y - 512.0) > 40.0:
			ok = false
			msgs.append("player rest y=%.1f not near expected 512" % y)
		if not is_finite(y):
			ok = false
			msgs.append("player y is not finite")

	if ok:
		print("[pass] land_probe: crow landed on ground (y=%.1f, on_floor=%s)" % [player.global_position.y, str(player.is_on_floor())])
	else:
		print("[FAIL] land_probe:")
		for m in msgs:
			print("        %s" % m)
	get_tree().quit(0 if ok else 1)
