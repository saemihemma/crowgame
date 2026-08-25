extends TestCase
## Phase 0.5: every palette role referenced by code exists in BOTH skins, so a
## theme swap can never leave a styling color undefined (would fall back to white).

const REQUIRED_ROLES := [
	"primary", "secondary", "accent", "danger", "textColor",
	"scrim", "scrim_soft", "text_light", "text_dim", "text_error",
	"danger_flash", "death_text", "coin", "dust", "enemy_pop", "spike",
	"laser", "muzzle", "touch_panel", "touch_label",
]

func _reset() -> void:
	_failures.clear()
	_assertions = 0

func _palette(path: String) -> Dictionary:
	var f := FileAccess.open(path, FileAccess.READ)
	var t: Dictionary = JSON.parse_string(f.get_as_text())
	f.close()
	return t.get("palette", {})

func test_forest_has_all_roles() -> void:
	var pal := _palette("res://data/themes/theme_forest.json")
	for role in REQUIRED_ROLES:
		assert_true(pal.has(role), "forest palette has role '%s'" % role)

func test_scifi_has_all_roles() -> void:
	var pal := _palette("res://data/themes/theme_scifi.json")
	for role in REQUIRED_ROLES:
		assert_true(pal.has(role), "scifi palette has role '%s'" % role)

## The tutorial's pattern strip colours a chip by its position in the repeating
## core, so a child sees the repeat before they read a single numeral. Two slots
## sharing a colour deletes that. `token_c` used to map to `coin`, which is the
## same hex as `accent` in emberwood -- the second and third slot of every
## pattern lesson were identical in that world, and nothing said so.
func test_tutorial_pattern_slots_are_distinct_in_every_theme() -> void:
	var roles: Array = []
	for part in ["token_a", "token_b", "token_c"]:
		roles.append(String(Config.tutorial("roles/%s" % part, "")))
	for path in _theme_paths():
		var palette := _palette(path)
		for i in roles.size():
			for j in range(i + 1, roles.size()):
				var a := String(palette.get(roles[i], "")).to_lower()
				var b := String(palette.get(roles[j], "")).to_lower()
				assert_true(a != "" and b != "" and a != b,
					"%s: tutorial roles %s (%s) and %s (%s) differ" % [
						path.get_file(), roles[i], a, roles[j], b])

func _theme_paths() -> Array:
	var out: Array = []
	var dir := DirAccess.open("res://data/themes")
	if dir == null:
		return out
	for file in dir.get_files():
		if file.ends_with(".json"):
			out.append("res://data/themes/%s" % file)
	return out
