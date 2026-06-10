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
