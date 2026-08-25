extends TestCase
## Every palette role referenced by code exists in every SHIPPED world theme, so
## selecting a world can never leave a styling colour undefined (which falls back
## to white).
##
## This used to check `forest` and `scifi` — and only those two. No level selects
## either one: all six entries in level_registry.json name a world, and
## DEFAULT_THEME_ID is `emberwood`. So the completeness check covered the two
## themes nobody sees and skipped the five that ship, which is backwards. It now
## covers the five, and asserting on the legacy ids is no longer what keeps them
## in the tree (see roadmap.md).

const WORLDS := ["emberwood", "prism_hollow", "sugarstorm", "geyserworks", "aurora_spire"]

const REQUIRED_ROLES := [
	"primary", "secondary", "accent", "danger", "textColor",
	"scrim", "scrim_soft", "text_light", "text_dim", "text_error",
	"danger_flash", "death_text", "coin", "dust", "enemy_pop", "spike",
	"laser", "muzzle", "touch_panel", "touch_label",
]

func _palette(path: String) -> Dictionary:
	var f := FileAccess.open(path, FileAccess.READ)
	assert_true(f != null, "%s is readable" % path)
	if f == null:
		return {}
	var t: Dictionary = JSON.parse_string(f.get_as_text())
	f.close()
	return t.get("palette", {})

func test_every_world_theme_has_all_roles() -> void:
	for world in WORLDS:
		var pal := _palette("res://data/themes/theme_%s.json" % world)
		for role in REQUIRED_ROLES:
			assert_true(pal.has(role), "%s palette has role '%s'" % [world, role])

## A theme the game can select but cannot fully style is the failure this guards
## against, so every registered theme must be loadable — not just the five worlds.
func test_every_registered_theme_loads() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("ThemeManager")
	for world in WORLDS:
		tm.set_theme(world)
		assert_eq(tm.get_theme_id(), world, "%s is selectable" % world)
	tm.set_theme("emberwood")  # restore the default
