extends RefCounted
class_name AbilityManager
## Godot port of the abilities framework (AbilityManager + abilities.json).
## Tracks the active ability set; grant/revoke emit EventBus signals and the HUD
## AbilitySlots react. Behaviors are pickup-granted (non-persistent) per the
## source; this is the scaffold call sites translate against.

var _defs: Dictionary = {}     # id -> definition
var _active: Dictionary = {}   # id -> true

func _init() -> void:
	for d in DataManager.get_dict("ABILITIES").get("abilities", []):
		_defs[String(d.get("id", ""))] = d

func grant(ability_id: String) -> void:
	if not _defs.has(ability_id) or _active.has(ability_id):
		return
	_active[ability_id] = true
	EventBus.ability_granted.emit({"abilityId": ability_id})

func revoke(ability_id: String) -> void:
	if not _active.has(ability_id):
		return
	_active.erase(ability_id)
	EventBus.ability_revoked.emit({"abilityId": ability_id})

func has_ability(ability_id: String) -> bool:
	return _active.has(ability_id)

func active_ids() -> Array:
	return _active.keys()

func known_ids() -> Array:
	return _defs.keys()

func clear() -> void:
	_active.clear()
