extends TestCase
## Does a world's art actually use that world's palette?
##
## This replaces tools/theme_screenshots.mjs, which walked the Phaser build,
## screenshotted each level and checked the rendered pixels. That harness drove
## the game through `window.__crowGame` and could not survive the port, so it was
## deleted — and with it went the only check that art matches its world. With 86
## art files still to land, that gap was worth closing before they arrive rather
## than after.
##
## The check moved DOWN a layer on purpose. The old one asked "do the rendered
## pixels look like this world", which needs a browser, a served build, a walk
## through the UI, and coordinate clicking that any layout change breaks. This
## asks the narrower question the art risk actually turns on — "is this PNG drawn
## in this world's palette" — directly against the file. No browser, no server,
## no navigation, and it runs inside the existing headless suite.
##
## What is NOT covered by moving down a layer: a colour hardcoded in GDScript
## instead of read from the theme. That was the old harness's other job, and it
## is already covered better by godot/tools/check_hardcoding.py, which bans
## inline Color literals outright and names the file and line.
##
## ── the thresholds, and why these numbers ───────────────────────────────────
##
## Measured before they were chosen, because a gate nobody has watched fail is
## not a gate. Share of opaque, non-neutral pixels within TOLERANCE of the
## nearest palette entry.
##
## At the old harness's TOLERANCE of 64 every world scored >= 0.905, including
## against other worlds' palettes. That check could not fail, which is the same
## defect as no check at all. At 32, art scores 0.82-0.97 on its own palette.
##
## What this can and cannot tell you. The full art-vs-palette matrix:
##
##   art \ palette   aurora  ember   geyser  prism   sugar
##   aurora_spire     0.820*  0.049   0.000   0.397   0.000
##   emberwood        0.128   0.847*  0.640   0.128   0.128
##   geyserworks      0.000   1.000   0.972*  0.000   0.000
##   prism_hollow     0.882   0.048   0.125   0.899*  0.487
##   sugarstorm       0.086   0.086   0.620   0.086   0.384*
##
## THE WORLDS ARE NOT COLOUR-DISJOINT. geyserworks art fits emberwood's palette
## (1.000) better than its own (0.972); prism_hollow scores 0.882 against
## aurora_spire. They share danger red, accents and text colours by design. So
## "art only matches its own world" is simply false, and an earlier draft of this
## file asserted it and failed — correctly. What survives is the weaker, true
## claim: art must be drawn in colours its own theme declares. That is the risk
## that matters when 86 files land, and it is exactly what sugarstorm violates.
##
## Greys are skipped. Ink, outlines and text are shared across every world by
## design, so counting them would flatter every palette equally.

const WORLDS := ["aurora_spire", "emberwood", "geyserworks", "prism_hollow", "sugarstorm"]

## Max RGB distance (0-255 space) for a pixel to count as on-palette.
const TOLERANCE := 32.0
## Share of sampled pixels that must be on-palette.
const FLOOR := 0.75
## Below this chroma a pixel is ink/grey, shared by every world.
const NEUTRAL_CHROMA := 24.0
## Below this alpha a pixel is not really drawn.
const MIN_ALPHA := 0.784  # 200/255

## sugarstorm is a KNOWN, MEASURED failure, waived here rather than by lowering
## FLOOR for everyone — a floor loose enough to admit 0.384 would admit foreign
## art too, and the gate would be decorative.
##
## Its tileset is drawn in a plum family its theme never declares:
##
##   #613049   1640 px   45.6 from the nearest palette entry
##   #94496f    216 px   54.5
##   #99872e      8 px   71.1
##
## Either the art is off-palette or theme_sugarstorm.json is missing those
## entries; that is an art call, not a code one. Delete this entry when it is
## made — the assertion below will then hold sugarstorm to the same bar as the
## rest, and test_waiver_list_stays_honest fails if it is waived while passing.
const WAIVED := {
	"sugarstorm": "tileset uses an undeclared plum family (#613049 x1640 px, 45.6 off)",
}


func _palette_of(world: String) -> Array:
	var file := FileAccess.open("res://data/themes/theme_%s.json" % world, FileAccess.READ)
	assert_true(file != null, "theme_%s.json is readable" % world)
	if file == null:
		return []
	var theme: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	var out: Array = []
	_collect_colors(theme, out)
	return out


## Themes carry colours in several nested shapes (palette, world, hud, dialog),
## mixed with sprite names. Walk the whole document and take anything that parses
## as a hex colour, rather than hardcoding which keys are colours today.
func _collect_colors(value: Variant, out: Array) -> void:
	if value is String:
		var text: String = value
		if text.begins_with("#") and (text.length() == 7 or text.length() == 9):
			out.append(Color(text))
	elif value is Dictionary:
		for key in value:
			_collect_colors(value[key], out)
	elif value is Array:
		for entry in value:
			_collect_colors(entry, out)


## Returns {share, sampled, worst} for one image against one palette.
## Every pixel is visited: these tilesets are small (under 3100 sampled pixels
## each), so striding would only add sampling noise for no real saving.
func _conformance(image: Image, palette: Array) -> Dictionary:
	var sampled := 0
	var on_palette := 0
	var worst := {}
	for y in image.get_height():
		for x in image.get_width():
			var pixel := image.get_pixel(x, y)
			if pixel.a < MIN_ALPHA:
				continue
			var high: float = maxf(pixel.r, maxf(pixel.g, pixel.b))
			var low: float = minf(pixel.r, minf(pixel.g, pixel.b))
			if (high - low) * 255.0 < NEUTRAL_CHROMA:
				continue
			sampled += 1
			var best := 1000000.0
			for entry in palette:
				var candidate: Color = entry
				var distance := sqrt(
					pow((pixel.r - candidate.r) * 255.0, 2)
					+ pow((pixel.g - candidate.g) * 255.0, 2)
					+ pow((pixel.b - candidate.b) * 255.0, 2))
				best = minf(best, distance)
			if best <= TOLERANCE:
				on_palette += 1
			else:
				var key := pixel.to_html(false)
				var seen: Array = worst.get(key, [0, best])
				seen[0] += 1
				worst[key] = seen
	return {
		"share": (float(on_palette) / float(sampled)) if sampled > 0 else 1.0,
		"sampled": sampled,
		"worst": worst,
	}


## The offenders, biggest block first, so a failure says what to recolour.
func _describe(worst: Dictionary, limit: int = 3) -> String:
	var rows: Array = []
	for key in worst:
		rows.append([worst[key][0], key, worst[key][1]])
	rows.sort_custom(func(a, b): return a[0] > b[0])
	var parts: Array[String] = []
	for i in mini(limit, rows.size()):
		parts.append("#%s x%d px (%.1f off)" % [rows[i][1], rows[i][0], rows[i][2]])
	return ", ".join(parts)


func test_each_world_tileset_uses_its_own_palette() -> void:
	for world in WORLDS:
		var image := Image.new()
		var path := "res://assets/tilesets/%s_tiles.png" % world
		assert_eq(image.load(path), OK, "%s tileset loads" % world)
		var result := _conformance(image, _palette_of(world))
		if WAIVED.has(world):
			continue
		assert_true(result["share"] >= FLOOR,
			"%s art is on its own palette: %.3f >= %.2f over %d px. Off-palette: %s"
				% [world, result["share"], FLOOR, result["sampled"], _describe(result["worst"])])


## The check must be able to FAIL, or it proves nothing.
##
## Scoring against another WORLD cannot be the control — see the matrix above,
## the palettes genuinely overlap. So score against a palette that belongs to no
## world at all. If real art clears FLOOR against three arbitrary colours, then
## TOLERANCE is wide enough to accept anything and the assertion above is
## decorative.
const ALIEN_PALETTE := [Color("#FF00FF"), Color("#00FF00"), Color("#0000FF")]

func test_an_alien_palette_is_rejected() -> void:
	for world in WORLDS:
		var image := Image.new()
		if image.load("res://assets/tilesets/%s_tiles.png" % world) != OK:
			continue
		var result := _conformance(image, ALIEN_PALETTE)
		assert_true(result["share"] < FLOOR,
			"%s art scores %.3f against magenta/green/blue — TOLERANCE is too wide to mean anything"
				% [world, result["share"]])


## A share is only meaningful over enough pixels. An empty or nearly-empty
## tileset would score 1.000 vacuously and sail through, which is how a gate
## silently stops gating.
const MIN_SAMPLED := 100

func test_every_tileset_has_enough_colour_to_judge() -> void:
	for world in WORLDS:
		var image := Image.new()
		assert_eq(image.load("res://assets/tilesets/%s_tiles.png" % world), OK,
			"%s tileset loads" % world)
		var result := _conformance(image, _palette_of(world))
		assert_true(result["sampled"] >= MIN_SAMPLED,
			"%s has only %d non-neutral opaque px; too few for the palette check to mean anything"
				% [world, result["sampled"]])


## A waiver that has quietly started passing is a lie in the source. This fails
## when the art is fixed but the WAIVED entry is left behind.
func test_waiver_list_stays_honest() -> void:
	for world in WAIVED:
		assert_true(world in WORLDS, "waived world %s is a real world" % world)
		var image := Image.new()
		if image.load("res://assets/tilesets/%s_tiles.png" % world) != OK:
			continue
		var result := _conformance(image, _palette_of(world))
		assert_true(result["share"] < FLOOR,
			"%s now scores %.3f and no longer needs its waiver — delete it from WAIVED"
				% [world, result["share"]])
