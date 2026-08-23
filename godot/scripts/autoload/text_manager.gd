extends Node
## TextManager — Godot port of src/systems/TextManager.ts (i18n).
## Default strings come from data/i18n/strings_en.json; user overrides persist
## under the same key (crow_translations). t(key, args...) does {0},{1} substitution.

const STORAGE_KEY := "crow_translations"
const LOCALE_KEY := "crow_locale"
const LOCALE_FILES := { "en": "STRINGS_EN", "is": "STRINGS_IS" }
## Each locale's name written in its own language. Deliberately never
## translated: a player stranded in a language they cannot read has to be able
## to recognise their own and find the way back out.
const LOCALE_ENDONYMS := { "en": "English", "is": "Íslenska" }

signal locale_changed(code: String)

var _defaults: Dictionary = {}        # English — always the fallback
var _locale_strings: Dictionary = {}  # active non-English locale (empty for en)
var _locale := "en"
var _overrides: Dictionary = {}

func _ready() -> void:
	# English is the canonical fallback; active locale overlays it.
	init(DataManager.get_dict("STRINGS_EN"))
	var saved: Variant = Persistence.get_item(LOCALE_KEY)
	set_locale(String(saved) if saved != null else "en")

func init(default_strings: Dictionary) -> void:
	_defaults = default_strings
	_load_overrides()

## Resolution order: user override -> active locale -> English -> raw key.
func t(key: String, args: Array = []) -> String:
	var value := String(_overrides.get(key, _locale_strings.get(key, _defaults.get(key, key))))
	for i in args.size():
		value = value.replace("{%d}" % i, str(args[i]))
	return value

## Whether a key exists in the active locale or in English. Lets callers fall
## back to data that is not translated yet (level names come from the registry).
func has(key: String) -> bool:
	return _locale_strings.has(key) or _defaults.has(key)

func set_locale(code: String) -> void:
	_locale = code if LOCALE_FILES.has(code) else "en"
	_locale_strings = {} if _locale == "en" else DataManager.get_dict(LOCALE_FILES[_locale])
	Persistence.set_item(LOCALE_KEY, _locale)
	locale_changed.emit(_locale)

func get_locale() -> String:
	return _locale

func available_locales() -> Array:
	return LOCALE_FILES.keys()

## The locale's own name for itself, for the language selector.
func endonym(code: String) -> String:
	return String(LOCALE_ENDONYMS.get(code, code))

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
