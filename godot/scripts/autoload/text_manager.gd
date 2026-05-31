extends Node
## TextManager — Godot port of src/systems/TextManager.ts (i18n).
## Default strings come from data/i18n/strings_en.json; user overrides persist
## under the same key (crow_translations). t(key, args...) does {0},{1} substitution.

const STORAGE_KEY := "crow_translations"

var _defaults: Dictionary = {}
var _overrides: Dictionary = {}

func _ready() -> void:
	# BootScene.create() called init(strings_en); here we self-init from DataManager.
	init(DataManager.get_dict("STRINGS_EN"))

func init(default_strings: Dictionary) -> void:
	_defaults = default_strings
	_load_overrides()

func t(key: String, args: Array = []) -> String:
	var value := String(_overrides.get(key, _defaults.get(key, key)))
	for i in args.size():
		value = value.replace("{%d}" % i, str(args[i]))
	return value

func get_all_keys() -> Array:
	return _defaults.keys()

func get_default(key: String) -> String:
	return String(_defaults.get(key, ""))

func get_override(key: String) -> String:
	return String(_overrides.get(key, ""))

func set_translation(key: String, value: String) -> void:
	if value != "":
		_overrides[key] = value
	else:
		_overrides.erase(key)
	_save_overrides()

func export_translations() -> Dictionary:
	return _overrides.duplicate(true)

func import_translations(data: Dictionary) -> void:
	_overrides = data.duplicate(true)
	_save_overrides()

func _load_overrides() -> void:
	var raw: Variant = Persistence.get_item(STORAGE_KEY)
	if raw != null:
		var parsed: Variant = JSON.parse_string(String(raw))
		_overrides = parsed if parsed is Dictionary else {}

func _save_overrides() -> void:
	Persistence.set_item(STORAGE_KEY, JSON.stringify(_overrides))
