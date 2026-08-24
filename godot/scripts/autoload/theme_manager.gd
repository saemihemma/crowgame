extends Node
## ThemeManager — ported from the retired Phaser build; this is now the only implementation.
## Holds registered theme definitions (forest/scifi) and the active theme, and
## exposes palette colors. Slice 8 promotes this to the full SkinPack swap system
## (Tier 3); for now it loads the JSON themes and serves colors.

signal theme_changed(theme_id: String)

## Every theme DataManager can serve, in registration order. The two legacy
## skins are kept only because tests assert on their ids; see roadmap.md.
const THEME_KEYS: PackedStringArray = [
	"THEME_FOREST",
	"THEME_SCIFI",
	"THEME_EMBERWOOD",
	"THEME_PRISM_HOLLOW",
	"THEME_SUGARSTORM",
	"THEME_GEYSERWORKS",
	"THEME_AURORA_SPIRE",
]

## Theme the menus wear, and the fallback when a level names none.
const DEFAULT_THEME_ID := "emberwood"

var _themes: Dictionary = {}   # id -> theme definition dict
var _active_id := DEFAULT_THEME_ID

func _ready() -> void:
	for key in THEME_KEYS:
		var def := DataManager.get_dict(key)
		if not def.is_empty():
			register_theme(def)
		else:
			push_warning("[ThemeManager] %s did not load" % key)
	if not _themes.has(_active_id) and not _themes.is_empty():
		_active_id = _themes.keys()[0]

## True when a theme id is registered. Callers use this rather than set_theme's
## silent no-op so a typo in level data is visible instead of inherited.
func has_theme(id: String) -> bool:
	return _themes.has(id)

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

## A colour from a theme that is NOT the active one.
##
## Level select shows every world at once, each painted in its own palette, so it
## needs to read five themes on one screen. Doing that by switching the active
## theme five times would fire theme_changed at every component in the tree and
## leave whichever world was last drawn as the live one.
func get_color_value_of(theme_id: String, key: String) -> Color:
	var palette: Dictionary = _themes.get(theme_id, {}).get("palette", {})
	var hex := String(palette.get(key, ""))
	return Color.html(hex) if hex != "" else get_color_value(key)
