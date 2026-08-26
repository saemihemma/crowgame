extends Node
## Config — single accessor for JSON-first game tuning (autoload).
##
## One obvious home per tunable value: edit data/tuning/*.json, never hardcode
## in .gd. Path syntax is slash-separated, e.g. Config.ui("touch/button_size").
## Math/learner tunables live in math_tuning.json (byte-identical with the web
## port's copy, read directly by LearnerStateManager and friends); motion
## parity constants stay in code and are guarded by golden tests.

func ui(path: String, default: Variant = null) -> Variant:
	return _lookup("UI_TUNING", path, default)

func fx(path: String, default: Variant = null) -> Variant:
	return _lookup("FX_TUNING", path, default)

## The maths tutorial's own tuning file. Separate from ui_tuning.json on purpose:
## it is the surface a UI/UX pass owns end to end (layout, pacing, and the map
## from each drawn part to a palette role), and keeping it in one file means a
## designer can retune the whole lesson without reading anything else.
func tutorial(path: String, default: Variant = null) -> Variant:
	return _lookup("TUTORIAL_TUNING", path, default)

## Generic access to any loaded tuning file by DataManager key (player_base,
## camera_tuning, combat_tuning, enemy_tuning, npc_tuning, leveling, ...).
func get_value(data_key: String, path: String, default: Variant = null) -> Variant:
	return _lookup(data_key, path, default)


# ─── Feature flags ────────────────────────────────────────
##
## An open product decision, as a value a grown-up can change without a rebuild.
##
## Distinct from every other accessor above, and the distinction is the point:
## those serve a tuned constant somebody decided, this serves a question nobody
## has answered yet. data/tuning/feature_flags.json carries the authored default
## and, in its `_`-prefixed siblings, the reasoning and the measurement behind it.
##
## Two override routes, and the asymmetry between them is deliberate:
##
##   THE GROWN-UP PANEL (ui/parent_report.gd) writes through Persistence and
##   works in a shipped build. That is the route a parent actually uses.
##
##   ?flags=math.group_tokens_in_fives:off is DEBUG ONLY.
##   systems/learner_sync_service.gd sets the precedent -- its API-base override
##   survives only in a debug build, because anything read from client-writable
##   storage is something any script on the origin can write. Gameplay flags are
##   nowhere near as sensitive as a child's learning records, but the URL route
##   exists to A/B two browser tabs during development and a child's build loses
##   nothing by not having it.
func flag(path: String, default: Variant = null) -> Variant:
	if _url_flags.has(path):
		return _url_flags[path]
	var stored: Variant = Persistence.get_item(FLAG_OVERRIDE_PREFIX + path)
	if stored != null:
		var parsed: Variant = JSON.parse_string(String(stored))
		if parsed != null:
			return parsed
	return _lookup("FEATURE_FLAGS", path, default)

const FLAG_OVERRIDE_PREFIX := "crow_flag_"

## Per-device override, as the panel sets it. JSON-encoded so a bool stays a bool
## and `hold_ms` stays a number -- Persistence stores strings, and "false" is
## truthy.
func set_flag_override(path: String, value: Variant) -> void:
	Persistence.set_item(FLAG_OVERRIDE_PREFIX + path, JSON.stringify(value))

## Back to the authored default. Not the same as setting the override TO the
## default: the panel shows whether a flag has been touched on this device, and
## an explicit override that happens to match is still a choice somebody made.
func clear_flag_override(path: String) -> void:
	Persistence.remove_item(FLAG_OVERRIDE_PREFIX + path)

func has_flag_override(path: String) -> bool:
	return Persistence.has_item(FLAG_OVERRIDE_PREFIX + path)

## The authored value, ignoring every override. The panel needs it to show what
## "reset" would go back to.
func flag_default(path: String, default: Variant = null) -> Variant:
	return _lookup("FEATURE_FLAGS", path, default)

var _url_flags: Dictionary = {}

func _ready() -> void:
	_url_flags = _parse_url_flags()
	if not _url_flags.is_empty():
		print("[Config] URL flag overrides: %s" % _url_flags)

## `?flags=a.b:on,c.d:1200` -> {"a/b": true, "c/d": 1200}.
##
## Dots in the query, slashes in the lookup path: the query form reads the way
## the JSON nests and the way this file's callers write it out in prose, and a
## slash in a URL query would have to be escaped.
func _parse_url_flags() -> Dictionary:
	var out: Dictionary = {}
	if not OS.is_debug_build() or not OS.has_feature("web"):
		return out
	var raw: Variant = JavaScriptBridge.eval("window.location.search", true)
	if raw == null:
		return out
	var query := String(raw).trim_prefix("?")
	for pair in query.split("&", false):
		var eq := pair.find("=")
		if eq < 0 or pair.substr(0, eq) != "flags":
			continue
		for entry in pair.substr(eq + 1).uri_decode().split(",", false):
			var colon := entry.rfind(":")
			if colon <= 0:
				continue
			var key := entry.substr(0, colon).strip_edges().replace(".", "/")
			out[key] = _coerce(entry.substr(colon + 1).strip_edges())
	return out

## "on"/"off" as well as "true"/"false", because the point of the URL route is
## typing it by hand.
##
## Deliberately NOT treating "1" and "0" as booleans, convenient as that would
## be: not every flag is a boolean. `death.hold_ms:0` has to mean the number
## zero, and a coercion that reads it as `false` would be right by accident
## (int(false) is 0) until the first flag whose zero and whose false differ.
func _coerce(text: String) -> Variant:
	match text.to_lower():
		"on", "true", "yes":
			return true
		"off", "false", "no":
			return false
	if text.is_valid_int():
		return text.to_int()
	if text.is_valid_float():
		return text.to_float()
	return text

func _lookup(data_key: String, path: String, default: Variant) -> Variant:
	var node: Variant = DataManager.get_dict(data_key)
	for part in path.split("/", false):
		if node is Dictionary and node.has(part):
			node = node[part]
		else:
			return default
	return node
