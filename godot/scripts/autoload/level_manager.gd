extends Node
## LevelManager — ported from the retired Phaser build; this is now the only implementation.
## Owns the level registry (sorted by `order`), tracks the current level, and
## orchestrates transitions by emitting level_complete.

var _registry: Array = []
var _current_level_key := ""

func _ready() -> void:
	init(DataManager.get_dict("LEVEL_REGISTRY"))

func init(registry_data: Dictionary) -> void:
	var levels: Array = registry_data.get("levels", [])
	_registry = levels.duplicate()
	_registry.sort_custom(func(a, b): return int(a.get("order", 0)) < int(b.get("order", 0)))

func get_levels() -> Array:
	return _registry

func get_level(key: String) -> Variant:
	for l in _registry:
		if String(l.get("key", "")) == key:
			return l
	return null

func get_current_level_key() -> String:
	return _current_level_key

func get_current_level() -> Variant:
	return get_level(_current_level_key)

func set_current_level(key: String) -> void:
	_current_level_key = key

func get_next_level() -> Variant:
	var idx := -1
	for i in _registry.size():
		if String(_registry[i].get("key", "")) == _current_level_key:
			idx = i
			break
	if idx < 0 or idx >= _registry.size() - 1:
		return null
	return _registry[idx + 1]

func get_next_level_key() -> String:
	var nxt = get_next_level()
	return String(nxt.get("key", "")) if nxt != null else ""

func transition_to(target_level_key: String) -> String:
	if _current_level_key != "":
		EventBus.level_complete.emit({
			"completedLevel": _current_level_key,
			"nextLevel": target_level_key,
		})
	return target_level_key

func has_level(key: String) -> bool:
	return get_level(key) != null
