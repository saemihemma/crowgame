extends Node
## Does the crow actually climb a ladder?
##
## Real physics, the real Game scene, the real ladder spawned from the real level
## file. Everything about ladders can be correct on paper -- the art registered,
## the object compiled, the reachability checker counting the cells -- while the
## crow slides down the rungs, and only running it finds that out.
##
## THREE THINGS, in the order a child meets them:
##   1. standing on a ladder does nothing until you ask (a ladder must not glue)
##   2. holding the up key climbs
##   3. letting go and pressing sideways hands you back to gravity
##
## Run: godot --headless --path godot res://tests/integration/ClimbProbe.tscn

const GAME_SCENE := preload("res://scenes/Game.tscn")
const SETTLE_FRAMES := 60
const CLIMB_FRAMES := 45
const FALL_FRAMES := 30

var _game: Node2D
var _frames := 0
var _phase := 0
var _y_at_ladder := 0.0
var _y_after_wait := 0.0
var _y_after_climb := 0.0
var _msgs: Array[String] = []

func _ready() -> void:
	_game = GAME_SCENE.instantiate()
	_game.level_key = "level_01"
	add_child(_game)

func _ladder() -> Ladder:
	var found := get_tree().get_nodes_in_group("ladder")
	return (found[0] as Ladder) if found.size() > 0 else null

func _physics_process(_delta: float) -> void:
	_frames += 1
	var player: CharacterBody2D = _game.get_player()
	var ladder: Ladder = _ladder()
	if player == null or ladder == null:
		if _frames > SETTLE_FRAMES:
			_finish(false, ["no player" if player == null else "no ladder in the level"])
		return

	match _phase:
		0:
			# Put the crow on the ladder's bottom rung and let it settle.
			if _frames < 10:
				return
			# The FOOT of the ladder, which a level authors to sit exactly on the
			# ground surface. Placing the crow a few pixels lower than this put
			# it inside the ground tile, and move_and_slide pushed it back out --
			# which the probe read as the ladder lifting it. A probe that starts
			# the crow inside a wall measures the wall.
			player.global_position = Vector2(ladder.centre_x(), ladder.bottom_y())
			_y_at_ladder = player.global_position.y
			_phase = 1
			_frames = 0
		1:
			# NOTHING PRESSED. A ladder must not catch a child who is merely
			# standing on it, so the crow should fall or stay -- never rise.
			if _frames < 12:
				return
			_y_after_wait = player.global_position.y
			if _y_after_wait < _y_at_ladder - 2.0:
				_msgs.append("the crow rose %.1fpx with no key held -- the ladder is glueing"
					% (_y_at_ladder - _y_after_wait))
			player.global_position = Vector2(ladder.centre_x(), ladder.bottom_y())
			Input.action_press("jump")
			_phase = 2
			_frames = 0
		2:
			if _frames < CLIMB_FRAMES:
				return
			_y_after_climb = player.global_position.y
			var risen: float = ladder.bottom_y() - _y_after_climb
			if risen < 32.0:
				_msgs.append("holding up climbed only %.1fpx in %d frames (want a tile or more)"
					% [risen, CLIMB_FRAMES])
			if not player.is_climbing():
				_msgs.append("the crow is not in the climbing state while holding up on a ladder")
			Input.action_release("jump")
			Input.action_press("move_right")
			_phase = 3
			_frames = 0
		3:
			if _frames < FALL_FRAMES:
				return
			Input.action_release("move_right")
			if player.is_climbing():
				_msgs.append("pressing sideways did not let go of the ladder")
			if player.global_position.y <= _y_after_climb:
				_msgs.append("the crow did not fall after stepping off (y %.1f -> %.1f)"
					% [_y_after_climb, player.global_position.y])
			_finish(_msgs.is_empty(), _msgs)

func _finish(ok: bool, msgs: Array) -> void:
	if ok:
		print("[pass] climb_probe: idle on a ladder holds still, holding up climbed %.0fpx, sideways let go"
			% (_ladder().bottom_y() - _y_after_climb))
	else:
		print("[FAIL] climb_probe:")
		for m in msgs:
			print("        " + String(m))
	get_tree().quit(0 if ok else 1)
