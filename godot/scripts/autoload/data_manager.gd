extends Node
## DataManager — loads the verbatim public/data/** JSON (copied into res://data)
## via FileAccess + JSON.parse_string and caches it. Godot port of the data
## preload phase of BootScene.preload(). JSON stays the source of truth; later
## slices hydrate typed Resource registries (Tier 3) on top of these dicts.

const DATA_ROOT := "res://data"

# Mirrors DATA_PATHS in src/utils/Constants.ts (relative to res://data).
const PATHS := {
	"LEVEL_REGISTRY": "levels/level_registry.json",
	"NPC_REGISTRY": "npcs/npc_registry.json",
	"ENEMY_REGISTRY": "enemies/enemy_registry.json",
	"MATH_EASY": "math/problems_easy.json",
	"MATH_DATASET": "math/problems_dataset.json",
	"MATH_GAPS": "math/problems_gaps.json",
	"MATH_CURRICULUM": "math/problems_curriculum.json",
	"PLAYER_TUNING": "tuning/player_base.json",
	"ABILITIES": "tuning/abilities.json",
	"LEVELING": "tuning/leveling.json",
	"COMBAT_TUNING": "tuning/combat_tuning.json",
	"CAMERA_TUNING": "tuning/camera_tuning.json",
	"ENEMY_TUNING": "tuning/enemy_tuning.json",
	"NPC_TUNING": "tuning/npc_tuning.json",
	"UI_TUNING": "tuning/ui_tuning.json",
	"FX_TUNING": "tuning/fx_tuning.json",
	"MATH_TUNING": "tuning/math_tuning.json",
	"THEME_FOREST": "themes/theme_forest.json",
	"THEME_SCIFI": "themes/theme_scifi.json",
	"AUDIO_MANIFEST": "audio/audio_manifest.json",
	"STRINGS_EN": "i18n/strings_en.json",
	"STRINGS_IS": "i18n/strings_is.json",
	"SCENES": "registries/scenes.json",
	"SPAWN_REGISTRY": "registries/spawn_registry.json",
	"SOUND_EVENTS": "audio/sound_events.json",
}

var _cache: Dictionary = {}
var _loaded := false

func _ready() -> void:
	load_all()

func load_all() -> void:
	if _loaded:
		return
	for key in PATHS:
		var rel: String = PATHS[key]
		_cache[key] = _load_json("%s/%s" % [DATA_ROOT, rel])
	_loaded = true

## Generic typed accessors -------------------------------------------------

func get_data(key: String) -> Variant:
	return _cache.get(key, null)

func get_dict(key: String) -> Dictionary:
	var v: Variant = _cache.get(key, null)
	return v if v is Dictionary else {}

func get_array(key: String) -> Array:
	var v: Variant = _cache.get(key, null)
	return v if v is Array else []

## Math pools --------------------------------------------------------------

## Returns the merged list of every MathProblem across the four pools, exactly
## as BootScene loads them (easy + dataset + gaps + curriculum).
func get_all_math_problems() -> Array:
	var out: Array = []
	for key in ["MATH_EASY", "MATH_DATASET", "MATH_GAPS", "MATH_CURRICULUM"]:
		out.append_array(_extract_problems(_cache.get(key, null)))
	return out

func get_total_problem_count() -> int:
	return get_all_math_problems().size()

func _extract_problems(pool: Variant) -> Array:
	# Pools may be a bare array or an object with a "problems" array.
	if pool is Array:
		return pool
	if pool is Dictionary and pool.has("problems") and pool["problems"] is Array:
		return pool["problems"]
	return []

func _load_json(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		push_warning("[DataManager] missing data file: %s" % path)
		return null
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_warning("[DataManager] could not open: %s" % path)
		return null
	var raw := f.get_as_text()
	f.close()
	var parsed: Variant = JSON.parse_string(raw)
	if parsed == null:
		push_warning("[DataManager] failed to parse JSON: %s" % path)
	return parsed
