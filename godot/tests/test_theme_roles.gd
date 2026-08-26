extends TestCase
## Every palette role referenced by code exists in EVERY world, so a theme swap
## can never leave a styling colour undefined (it would fall back to white).
##
## This used to assert on two skins by path -- `theme_forest` and `theme_scifi`,
## a pair that predated the worlds and that these two tests were the only reason
## to keep. The five worlds are the themes now, and asserting on all of them
## instead of on two placeholders is both the honest check and one fewer thing
## whose deletion breaks a test.

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

## Every world listed in the level registry, rather than a hardcoded list: a
## sixth world added without a palette role should fail here, not on a player's
## screen.
func test_every_world_palette_has_all_roles() -> void:
	var worlds := _world_theme_ids()
	assert_true(worlds.size() >= 5, "the registry names the worlds to check (found %d)" % worlds.size())
	for id in worlds:
		var path := "res://data/themes/theme_%s.json" % id
		assert_true(FileAccess.file_exists(path), "%s has a palette file" % id)
		var pal := _palette(path)
		for role in REQUIRED_ROLES:
			assert_true(pal.has(role), "%s palette has role '%s'" % [id, role])

func _world_theme_ids() -> Array:
	var ids: Array = []
	for level in DataManager.get_dict("LEVEL_REGISTRY").get("levels", []):
		var id := String((level as Dictionary).get("theme", ""))
		if id != "" and not ids.has(id):
			ids.append(id)
	return ids

## Every drawn part of a lesson has to be VISIBLE, in every world.
##
## The test this replaces asserted that the three pattern-strip colours were
## different hex values. They were, and it passed, while the third one sat at
## 1.16:1 against the board in prism_hollow -- different, and invisible. Testing
## identity where the requirement is perceptibility is how that got through.
##
## WCAG 1.4.11 asks 3:1 for a graphic that carries meaning. These do: a token a
## child cannot see is a quantity they cannot count.
const MIN_GRAPHIC_CONTRAST := 3.0

func test_every_drawn_part_is_visible_on_the_board_in_every_theme() -> void:
	var parts: Array = ["token_a", "token_b", "line", "mark", "highlight", "numeral"]
	for path in _theme_paths():
		var palette := _palette(path)
		var board := _colour(palette, String(Config.tutorial("roles/board_bg", "boardBg")))
		for part: Variant in parts:
			var role := String(Config.tutorial("roles/%s" % part, ""))
			var ratio := _contrast(board, _colour(palette, role))
			assert_true(ratio >= MIN_GRAPHIC_CONTRAST,
				"%s: %s (%s) is %.2f:1 on the board, needs %.1f" % [
					path.get_file(), part, role, ratio, MIN_GRAPHIC_CONTRAST])

## Relative luminance, WCAG 2.x.
static func _relative_luminance(c: Color) -> float:
	var channels := [c.r, c.g, c.b]
	var out := 0.0
	var weights := [0.2126, 0.7152, 0.0722]
	for i in 3:
		var v: float = channels[i]
		v = v / 12.92 if v <= 0.03928 else pow((v + 0.055) / 1.055, 2.4)
		out += v * float(weights[i])
	return out

static func _contrast(a: Color, b: Color) -> float:
	var la := _relative_luminance(a)
	var lb := _relative_luminance(b)
	return (maxf(la, lb) + 0.05) / (minf(la, lb) + 0.05)

func _colour(palette: Dictionary, role: String) -> Color:
	return Color(String(palette.get(role, "#000000")).substr(0, 7))

func _theme_paths() -> Array:
	var out: Array = []
	var dir := DirAccess.open("res://data/themes")
	if dir == null:
		return out
	for file in dir.get_files():
		if file.ends_with(".json"):
			out.append("res://data/themes/%s" % file)
	return out
