extends Node
## ThemeManager — ported from the retired Phaser build; this is now the only implementation.
## Holds registered theme definitions (forest/scifi) and the active theme, and
## exposes palette colors. Slice 8 promotes this to the full SkinPack swap system
## (Tier 3); for now it loads the JSON themes and serves colors.

signal theme_changed(theme_id: String)

var _themes: Dictionary = {}   # id -> theme definition dict
var _active_id := "forest"

func _ready() -> void:
	for def in [DataManager.get_dict("THEME_FOREST"), DataManager.get_dict("THEME_SCIFI")]:
		if not def.is_empty():
			register_theme(def)
	if not _themes.has(_active_id) and not _themes.is_empty():
		_active_id = _themes.keys()[0]

func register_theme(definition: Dictionary) -> void:
	var id := String(definition.get("id", ""))
	if id != "":
		_themes[id] = definition

func set_theme(id: String) -> void:
	if _themes.has(id):
		_active_id = id
		theme_changed.emit(id)

func get_theme() -> Dictionary:
	return _themes.get(_active_id, {})

func get_theme_id() -> String:
	return _active_id

## CSS hex string for a palette key (e.g. "primary"), or "" if missing.
func get_color(key: String) -> String:
	var palette: Dictionary = get_theme().get("palette", {})
	return String(palette.get(key, ""))

## Parsed Color for a palette key, falling back to white.
func get_color_value(key: String) -> Color:
	var hex := get_color(key)
	return Color.html(hex) if hex != "" else Color.WHITE
