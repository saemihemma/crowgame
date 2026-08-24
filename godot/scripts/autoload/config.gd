extends Node
## Config — single accessor for JSON-first game tuning (autoload).
##
## One obvious home per tunable value: edit data/tuning/*.json, never hardcode
## in .gd. Path syntax is slash-separated, e.g. Config.ui("touch/button_size").
## Math/learner tunables live in math_tuning.json (byte-identical with the web
## port's copy, read directly by LearnerStateManager and friends); motion
## parity constants stay in code and are guarded by golden tests.

func ui(path: String, default: Variant = null) -> Variant:
	return _lookup("UI_TUNING", path, default)

func fx(path: String, default: Variant = null) -> Variant:
	return _lookup("FX_TUNING", path, default)

## Generic access to any loaded tuning file by DataManager key (player_base,
## camera_tuning, combat_tuning, enemy_tuning, npc_tuning, leveling, ...).
func get_value(data_key: String, path: String, default: Variant = null) -> Variant:
	return _lookup(data_key, path, default)

func _lookup(data_key: String, path: String, default: Variant) -> Variant:
	var node: Variant = DataManager.get_dict(data_key)
	for part in path.split("/", false):
		if node is Dictionary and node.has(part):
			node = node[part]
		else:
			return default
	return node
