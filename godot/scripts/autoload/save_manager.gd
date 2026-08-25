extends Node
## SaveManager — ported from the retired Phaser build; this is now the only implementation.
## Profile-aware persistence over Persistence (user://). Same SaveData shape,
## same auto-save-on-event behaviour. ELO/learner hooks plug in at slice 3 and
## are read defensively until then.

const SAVE_VERSION := 1

var _data: Dictionary = {}
var _auto_save_enabled := true

func _ready() -> void:
	_data = _create_default_save()
	load_save()
	_register_listeners()

func _get_save_key() -> String:
	return ProfileManager.get_active_save_key()

## Read-only snapshot (callers must not mutate; mirrors getData()).
func get_data() -> Dictionary:
	return _data

func save() -> void:
	_data["timestamp"] = _now_ms()
	var elo := get_node_or_null("/root/ELOManager")
	if elo != null and elo.has_method("get_stats"):
		_data["eloStats"] = elo.get_stats()
	var learner := get_node_or_null("/root/LearnerStateManager")
	if learner != null and learner.has_method("is_initialized") and learner.is_initialized():
		_data["learnerState"] = learner.get_snapshot()
	Persistence.set_item(_get_save_key(), JSON.stringify(_data))

func load_save() -> void:
	var raw: Variant = Persistence.get_item(_get_save_key())
	if raw != null:
		var parsed: Variant = JSON.parse_string(String(raw))
		if parsed is Dictionary:
			parsed = migrate_save(parsed)
		if parsed is Dictionary and int(parsed.get("version", -1)) == SAVE_VERSION:
			var defaults := _create_default_save()
			# Shallow-merge defaults <- parsed (parsed wins), like {...defaults, ...parsed}.
			_data = defaults.duplicate(true)
			for k in parsed:
				_data[k] = parsed[k]
			# Deep-merge the nested objects spread would have flattened.
			_data["mathStats"] = _merge(defaults["mathStats"], parsed.get("mathStats", {}))
			_data["telemetry"] = _merge(defaults["telemetry"], parsed.get("telemetry", {}))
			_data["settings"] = _merge(defaults["settings"], parsed.get("settings", {}))
			if parsed.has("learnerState"):
				_data["learnerState"] = parsed["learnerState"]
			return
	_data = _create_default_save()

## Migration seam: upgrade an older save dict toward SAVE_VERSION so schema
## changes never discard a child's progress. Add one step per version bump.
## A save with no version is treated as v1 (the original shape). A newer-than-
## known version is left as-is (load_save then falls back to defaults safely —
## we never downgrade an unknown future schema).
func migrate_save(parsed: Dictionary) -> Dictionary:
	var data := parsed.duplicate(true)
	var v := int(data.get("version", 1))
	# while v < SAVE_VERSION: match v: 1: <upgrade v1 -> v2 here>; v += 1
	# v1 is current — no migration steps yet; the seam + tests guard future bumps.
	if not data.has("version"):
		data["version"] = v
	return data

func switch_profile() -> void:
	_data = _create_default_save()
	load_save()

func clear() -> void:
	Persistence.remove_item(_get_save_key())
	var active = ProfileManager.get_active_profile()
	if active != null and active.get("childId", "") != "":
		var cid: String = active["childId"]
		Persistence.remove_item("crow_learner_snapshot_%s" % cid)
		Persistence.remove_item("crow_learner_pending_attempts_%s" % cid)
	_data = _create_default_save()

## The cloud-save arbiter. Read from eloStats, which is where ELOManager's state
## is embedded on save() — the same number the server compares.
func get_problems_attempted() -> int:
	var elo: Variant = _data.get("eloStats", {})
	if elo is Dictionary:
		return int((elo as Dictionary).get("problemsAttempted", 0))
	return 0

func get_save_version() -> int:
	return SAVE_VERSION

## Replace local state with a save the server says is authoritative.
##
## Runs the same migrate_save() path as a disk load, because a save that has been
## sitting in the cloud can be older than this build. Then rehydrates the
## in-memory systems: a save blob on its own changes nothing a player can see
## until ELO and learner state are restored from it.
func adopt_remote_save(remote: Variant) -> void:
	if not (remote is Dictionary) or (remote as Dictionary).is_empty():
		return
	_data = migrate_save(remote as Dictionary)
	Persistence.set_item(_get_save_key(), JSON.stringify(_data))
	# initialize() is the real rehydrate entry point — the same one ELOManager
	# uses at boot when it reads save.eloStats. There is no load_stats().
	if _data.has("eloStats"):
		ELOManager.initialize(_data["eloStats"])
	if _data.has("learnerState"):
		LearnerStateManager.replace_snapshot(_data["learnerState"])
	EventBus.save_adopted.emit()

func has_save() -> bool:
	return Persistence.has_item(_get_save_key())

# --- Convenience mutators ---

func add_coins(amount: int) -> void:
	_data["coins"] = int(_data["coins"]) + amount
	if _auto_save_enabled: save()


func increment_owls_saved() -> void:
	_data["owlsSaved"] = int(_data["owlsSaved"]) + 1
	if _auto_save_enabled: save()

func set_current_level(level: String) -> void:
	_data["currentLevel"] = level
	if _auto_save_enabled: save()

func complete_level(level_key: String) -> void:
	# Saves written before this key existed have no completedLevels; backfill
	# instead of crashing the first level completion on an old profile.
	if not (_data.get("completedLevels") is Array):
		_data["completedLevels"] = []
	if not (_data["completedLevels"] as Array).has(level_key):
		(_data["completedLevels"] as Array).append(level_key)
	if _auto_save_enabled: save()

func record_math_attempt(attempt: Dictionary) -> void:
	# attempt: { skills: Array, correct: bool, hintsUsed: int, timeMs: float, problemId: String }
	var stats: Dictionary = _data["mathStats"]
	if attempt.get("correct", false):
		stats["totalCorrect"] = int(stats["totalCorrect"]) + 1
	else:
		stats["totalWrong"] = int(stats["totalWrong"]) + 1
	var by_skill: Dictionary = stats["bySkill"]
	for skill in attempt.get("skills", []):
		if not by_skill.has(skill):
			by_skill[skill] = {"correct": 0, "wrong": 0, "avgTimeMs": 0.0}
		var entry: Dictionary = by_skill[skill]
		if attempt.get("correct", false):
			entry["correct"] = int(entry["correct"]) + 1
		else:
			entry["wrong"] = int(entry["wrong"]) + 1
		var total: int = int(entry["correct"]) + int(entry["wrong"])
		entry["avgTimeMs"] = ((float(entry["avgTimeMs"]) * (total - 1)) + float(attempt.get("timeMs", 0.0))) / total
	var tel: Dictionary = _data["telemetry"]
	tel["hintUsage"] = int(tel["hintUsage"]) + int(attempt.get("hintsUsed", 0))
	tel["problemsAttempted"] = int(tel["problemsAttempted"]) + 1
	var answered: Array = tel["answeredProblemIds"]
	answered.append(attempt.get("problemId", ""))
	if answered.size() > 100:
		tel["answeredProblemIds"] = answered.slice(answered.size() - 100)
	if _auto_save_enabled: save()


func grant_ability(ability_id: String) -> void:
	if not (_data["activeAbilities"] as Array).has(ability_id):
		(_data["activeAbilities"] as Array).append(ability_id)
	if _auto_save_enabled: save()

# --- Auto-save listeners ---

func _register_listeners() -> void:
	EventBus.coins_changed.connect(func(coins): _data["coins"] = coins; if _auto_save_enabled: save())
	EventBus.owl_saved.connect(increment_owls_saved)
	EventBus.level_complete.connect(func(payload): complete_level(String(payload.get("completedLevel", ""))))
	EventBus.ability_granted.connect(func(payload): grant_ability(String(payload.get("abilityId", ""))))
	EventBus.save_game.connect(save)

func _merge(base: Dictionary, over: Dictionary) -> Dictionary:
	var out := base.duplicate(true)
	for k in over:
		out[k] = over[k]
	return out

func _create_default_save() -> Dictionary:
	return {
		"version": SAVE_VERSION,
		"currentLevel": "level_01",
		"completedLevels": [],
		"coins": 0,
		"stars": 0,
		"owlsSaved": 0,
		"xp": 0,
		"playerLevel": 1,
		"inventory": [],
		"activeAbilities": [],
		"mathStats": {"totalCorrect": 0, "totalWrong": 0, "bySkill": {}},
		"telemetry": {"hintUsage": 0, "problemsAttempted": 0, "answeredProblemIds": []},
		"settings": {"musicVolume": 0.7, "sfxVolume": 1.0},
		"timestamp": _now_ms(),
	}

func _now_ms() -> int:
	return int(Time.get_unix_time_from_system() * 1000.0)
