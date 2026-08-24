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

## Resolve a key with NAMED parameters: `t()` substitutes {0}, {1}, this
## substitutes {a}, {op}, {sum}.
##
## The math pools need names rather than positions. A prompt template is
## "What is {a} {op} {b}?" and its Icelandic counterpart may order the operands
## differently; with positional args the two locales would silently disagree
## about which number goes where.
##
## A parameter may itself be a { "key": ..., "params": ... } dictionary, which is
## rendered first. That is how a prefixed prompt composes: "Mixed fact: {inner}"
## where `inner` is the phrasing for "What is 3 x 4?".
##
## Returns an empty string when the key resolves to nothing, so the caller can
## fall back to the canonical English in the problem data instead of showing a
## raw key to a child. Mirrors TextManager.tp() in the web build.
func tp(key: String, params: Dictionary = {}, plural: String = "") -> String:
	var resolved := _plural_key(key, params, plural)
	if not _has_key(resolved):
		# A locale with no `.one` form for this key falls back to its own base
		# wording rather than to English.
		resolved = key
	if not _has_key(resolved):
		return ""
	var template := String(_overrides.get(resolved, _locale_strings.get(resolved, _defaults.get(resolved, ""))))
	return _substitute(template, params)


func _has_key(key: String) -> bool:
	return _overrides.has(key) or _locale_strings.has(key) or _defaults.has(key)


## Pick the `.one` variant of a key when the number driving it takes the
## singular in the ACTIVE locale.
##
## The rule differs per language, which is why it lives here and not in the data:
## English inflects at 1, Icelandic at 1 and at anything else ending in 1 except
## 11 -- so 21 is "1 hópur" territory in Icelandic but plain "21 groups" in
## English. The data names the driving parameter; each locale decides what its
## value means. Mirrors TextManager.pluralKey() in the web build.
func _plural_key(key: String, params: Dictionary, plural: String) -> String:
	if plural.is_empty() or not params.has(plural):
		return key
	var value: Variant = params[plural]
	if not (value is int or value is float):
		return key
	var n := int(value)
	var is_one := (n % 10 == 1 and n % 100 != 11) if _locale == "is" else (n == 1)
	return "%s.one" % key if is_one else key


func _substitute(template: String, params: Dictionary) -> String:
	var out := template
	for name: Variant in params.keys():
		var placeholder := "{%s}" % String(name)
		if not out.contains(placeholder):
			continue
		var value: Variant = params[name]
		var rendered := ""
		if value is Dictionary and (value as Dictionary).has("key"):
			var ref := value as Dictionary
			rendered = tp(String(ref["key"]), ref.get("params", {}), String(ref.get("plural", "")))
			if rendered.is_empty():
				continue
		else:
			rendered = str(value)
		out = out.replace(placeholder, rendered)
	return out


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
