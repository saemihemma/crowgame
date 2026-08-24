extends Node
## LevelManager — Godot port of src/systems/LevelManager.ts.
## Owns the level registry (sorted by `order`), tracks the current level, and
## orchestrates transitions by emitting level_complete.

var _registry: Array = []
var _current_level_key := ""

## Cached per level: level select asks for all six at once, every time it opens.
var _owl_counts: Dictionary = {}

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

## How many owls a level asks the player to free.
##
## Lives here rather than in Game because level select needs the same number to
## draw a world's owl row, and two implementations of "what counts as an owl"
## would drift the moment a new challenger behaviour is added.
func owl_count(key: String) -> int:
	if _owl_counts.has(key):
		return int(_owl_counts[key])
	var count := _count_owls(key)
	_owl_counts[key] = count
	return count

func _count_owls(key: String) -> int:
	var entry: Variant = get_level(key)
	if entry == null:
		return 0
	var path := "res://%s" % String(entry.get("mapFile", ""))
	if not FileAccess.file_exists(path):
		return 0
	var f := FileAccess.open(path, FileAccess.READ)
	var level: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(level) != TYPE_DICTIONARY:
		return 0

	var by_id := {}
	for npc in DataManager.get_dict("NPC_REGISTRY").get("npcs", []):
		by_id[String(npc.get("id", ""))] = npc

	var count := 0
	for layer in level.get("layers", []):
		if String(layer.get("type", "")) != "objectgroup":
			continue
		for obj in layer.get("objects", []):
			if String(obj.get("type", "")) != "npc":
				continue
			var id := ""
			for prop in obj.get("properties", []):
				if String(prop.get("name", "")) == "npc_id":
					id = String(prop.get("value", ""))
			# Only challengers count. A signpost NPC is not a goal.
			if String(by_id.get(id, {}).get("behavior", "")) == "math_challenger":
				count += 1
	return count

func has_level(key: String) -> bool:
	return get_level(key) != null
