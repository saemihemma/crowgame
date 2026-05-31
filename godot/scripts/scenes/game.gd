extends Node2D
## Game — Godot port of the level-load/spawn/camera core of GameScene.ts.
## Slice 4 scope: load the compiled level, build tilemap layers, spawn the player
## at player_spawn, and follow with a deadzone camera. Coins/lives/hazards/doors/
## enemies/NPCs arrive in later slices.

const PLAYER_SCENE := preload("res://scenes/Player.tscn")

@export var level_key := ""  # empty -> LevelManager current, else default level_01

var _parsed: Dictionary = {}
var _player: CharacterBody2D

func _ready() -> void:
	var key := level_key
	if key == "":
		key = LevelManager.get_current_level_key()
	if key == "":
		key = "level_01"
	LevelManager.set_current_level(key)
	_load_level(key)

func _load_level(key: String) -> void:
	var entry = LevelManager.get_level(key)
	if entry == null:
		push_error("[Game] unknown level: %s" % key)
		return
	var map_path := "res://%s" % String(entry.get("mapFile", ""))
	if not FileAccess.file_exists(map_path):
		push_error("[Game] missing map file: %s" % map_path)
		return
	var f := FileAccess.open(map_path, FileAccess.READ)
	var level: Dictionary = JSON.parse_string(f.get_as_text())
	f.close()

	var world := Node2D.new()
	world.name = "World"
	add_child(world)
	_parsed = LevelLoader.build(world, level)

	_spawn_entities()
	_setup_camera()

func _spawn_entities() -> void:
	for s in _parsed.get("spawns", []):
		match s["type"]:
			"player_spawn":
				_player = PLAYER_SCENE.instantiate()
				# Tiled object: place feet (player origin) at bottom-center of the box.
				_player.global_position = Vector2(s["x"] + s["width"] * 0.5, s["y"] + s["height"])
				add_child(_player)
			_:
				# collectible/npc/door/hazard/enemy handled in later slices.
				pass

func _setup_camera() -> void:
	if _player == null:
		return
	var cam := Camera2D.new()
	cam.name = "Camera"
	var tuning := DataManager.get_dict("CAMERA_TUNING")
	# followLerp 0.1 -> smoothed follow; deadzone -> drag margins.
	cam.position_smoothing_enabled = true
	cam.position_smoothing_speed = maxf(1.0, float(tuning.get("followLerp", 0.1)) * 50.0)
	var dz: Dictionary = tuning.get("deadzone", {"width": 200, "height": 100})
	cam.drag_horizontal_enabled = true
	cam.drag_vertical_enabled = true
	cam.drag_left_margin = clampf((float(dz.get("width", 200)) * 0.5) / 480.0, 0.0, 0.9)
	cam.drag_right_margin = cam.drag_left_margin
	cam.drag_top_margin = clampf((float(dz.get("height", 100)) * 0.5) / 270.0, 0.0, 0.9)
	cam.drag_bottom_margin = cam.drag_top_margin
	# Map limits.
	cam.limit_left = 0
	cam.limit_top = 0
	cam.limit_right = int(_parsed["width"]) * int(_parsed["tile_w"])
	cam.limit_bottom = int(_parsed["height"]) * int(_parsed["tile_h"])
	_player.add_child(cam)
	cam.make_current()

func get_player() -> CharacterBody2D:
	return _player
