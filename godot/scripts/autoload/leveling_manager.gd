extends Node
## LevelingManager — ported from the retired Phaser build; this is now the only implementation.
## Player XP / level progression. Awards XP on math_challenge_complete using the
## scoring table from data/tuning/leveling.json and persists via SaveManager.

var _config: Dictionary = {}
var _xp := 0
var _player_level := 1

func _ready() -> void:
	init(DataManager.get_dict("LEVELING"))

func init(config: Dictionary) -> void:
	_config = config
	var save := SaveManager.get_data()
	_xp = int(save.get("xp", 0))
	_player_level = int(save.get("playerLevel", 1))
	EventBus.math_challenge_complete.connect(_on_math_complete)


func get_xp_for_current_level() -> int:
	var per: Array = _config.get("xpPerLevel", [])
	if per.is_empty():
		return 10
	var idx: int = clampi((_player_level if _player_level > 0 else 1) - 1, 0, per.size() - 1)
	return int(per[idx])


func add_xp(amount: int) -> void:
	_xp += amount
	if _xp < 0:
		_xp = 0
	var max_level := int(_config.get("maxLevel", 10))
	while _player_level < max_level:
		var needed := get_xp_for_current_level()
		if _xp >= needed:
			_xp -= needed
			_player_level += 1
			EventBus.level_up.emit({"level": _player_level})
		else:
			break
	var save := SaveManager.get_data()
	save["xp"] = _xp
	save["playerLevel"] = _player_level
	SaveManager.save()
	EventBus.xp_changed.emit({"xp": _xp, "level": _player_level, "needed": get_xp_for_current_level()})

func _on_math_complete(data: Dictionary) -> void:
	var s: Dictionary = _config.get("scoring", {})
	if data.get("correct", false):
		add_xp(int(s.get("correctFirstAttempt", 3)) if data.get("firstAttempt", false) else int(s.get("correctSecondAttempt", 1)))
	else:
		add_xp(int(s.get("doubleFailure", -1)))
