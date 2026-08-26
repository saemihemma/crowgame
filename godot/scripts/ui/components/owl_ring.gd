extends Control
class_name OwlRing
## The HUD's goal anchor — a segmented ring that fills as owls are rescued.
##
## Replaces three lines of yellow text in which the entire point of the game
## rendered at the same weight as a coin count. A ring answers "how close am I"
## without reading a number, which matters for a player still learning to read.
##
## brand/BRAND_SYSTEM.md §8.2 (pods) and §10.2 (streak).

const RADIUS := 32.0
const STROKE := 7.0
## Wide, near-opaque bezel. This is the contrast floor: §8.6b requires a HUD
## element to carry its own legibility rather than borrow it from the world,
## and the first build of this ring was the least visible thing on screen
## against a bright dawn sky.
const BEZEL := 11.0
const BEZEL_RADIUS_OFFSET := 1.5
## 2px at 0.55, not 1px at 0.26: the first build's rim was invisible at capture
## size, which meant the ring had no bright outer edge and the whole pod sank
## into any world lighter than the bezel.
const RIM := 2.0
## Where the streak flame sits, measured out from the rim rather than in from
## RADIUS.
##
## IT USED TO BE DRAWN INSIDE THE BEZEL, AND WAS THEREFORE INVISIBLE. The dashes
## went at RADIUS + 6 = 38px, and the bezel is an 11px band covering 28 to 39
## with the paper rim on top of it at 37.5 to 39.5 -- so a 1.5px dash at 45%
## alpha was laid over the two widest, darkest strokes the ring draws. The first
## screenshot ever taken of a lit streak (godot/tools/capture.sh hud-streak) shows
## a ring with no flame on it at all, which is what that entire capture variant
## was added to find out.
##
## Outside the rim, thicker and near-opaque: the flame is an announcement, and
## brand/BRAND_SYSTEM.md §10.2 gives it its own visual register rather than a
## tint of the ring's.
const FLAME_GAP := 4.0
const FLAME_THICKNESS := 3.0
const FLAME_RADIUS := RADIUS + BEZEL * 0.5 + BEZEL_RADIUS_OFFSET + RIM + FLAME_GAP

## How far the outermost ink reaches from the centre. The control box is sized
## from this rather than from RADIUS: the first build laid out a 61px box around
## 64px of drawing, so the bezel spilled outside its own bounds and the anchored
## right edge sat a few pixels off the margin it claimed to honour. The flame is
## now the outermost thing, so it is what this measures.
const EXTENT := FLAME_RADIUS + FLAME_THICKNESS * 0.5

## Unlit segments are a fixed blend of owl toward ink rather than owl at an
## alpha. Alpha takes its result from whatever is behind it, which on the dawn
## sky of level_01 turned the track olive — a colour in no palette in the pack.
## Mixed this far down because at 0.62 the track sat mid-tone, close enough to
## the bezel that the whole ring read as one grey donut and a lit segment had
## nothing to be brighter *than*. An empty socket should look empty — but at
## 0.78 it went the other way and vanished into the disc, so a player could not
## count how many owls the level held. This sits between: dark against the lit
## gold, distinctly lighter than the disc and bezel it lies on.
const TRACK_MIX := 0.70
const SEGMENT_GAP_RAD := 0.16
## Above this many owls the ring stops drawing one segment each and becomes a
## continuous arc. Segments exist to be counted at a glance; the practice arena
## has twenty, and twenty segments read as the teeth of a cog rather than as
## progress. The fraction underneath carries the exact number either way.
const MAX_SEGMENTS := 12
const SWEEP_SECONDS := 0.4
## brand/BRAND_SYSTEM.md §10.2: "the flame dims to 40%".
const PAUSED_FLAME_ALPHA := 0.4

## Matches the 32x32 icon source 1:1, so pixel art lands on whole pixels.
const ICON_SIZE := 32.0
## Preferred dedicated icon; the ring falls back to a head crop of the world
## sprite until it exists. Drop a file here and the ring picks it up with no
## code change (brand/ASSET_MANIFEST.md P1).
const ICON_KEY := "hud_owl_icon"
const ICON_FALLBACK_KEY := "owl"
## Head-and-shoulders window into the world sprite. The full 64px owl is in
## chains holding a padlock; shrunk to 30px that detail collapses into noise,
## and a HUD icon has one job — say "owl" in a glance.
const ICON_FALLBACK_REGION := Rect2(10, 3, 44, 34)

var _segments := 3
var _filled := 0
## Animated 0..1 around the whole ring, so a rescue can be tweened.
var _sweep := 0.0
var _streak := 0
## A miss dims the flame instead of putting it out (§10.2). The count is intact
## underneath; this is the visual half of "paused, not lost".
var _streak_paused := false

var _icon: TextureRect
var _progress: Label

func _ready() -> void:
	custom_minimum_size = Vector2(EXTENT * 2, EXTENT * 2)
	size = custom_minimum_size
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build()
	_refresh_text()

	EventBus.level_owls.connect(_on_level_owls)
	EventBus.owl_saved.connect(_on_owl_saved)
	EventBus.streak_changed.connect(_on_streak_changed)
	ThemeManager.theme_changed.connect(func(_id): _apply_theme(); queue_redraw())

func _build() -> void:
	var c := Vector2(EXTENT, EXTENT)

	# Icon sits above centre; the count sits below it. Both are inside the ink
	# disc, which is what pays for their contrast — a count parked on the bezel
	# (where the first build put it) is legible against neither.
	var icon_texture := _load_icon()
	if icon_texture != null:
		_icon = TextureRect.new()
		_icon.texture = icon_texture
		_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		_icon.size = Vector2(ICON_SIZE, ICON_SIZE)
		_icon.position = c - Vector2(ICON_SIZE * 0.5, ICON_SIZE * 0.5 + 8.0)
		_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(_icon)

	# No drop shadow: the disc under it already carries the contrast, and a
	# shadow on top of a plate only muddies the glyph edges (§8.6b).
	_progress = Label.new()
	_progress.add_theme_font_size_override("font_size", 18)
	_progress.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_progress.size = Vector2(RADIUS * 2, 24)
	_progress.position = Vector2(c.x - RADIUS, c.y + 6.0)
	_progress.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_progress)

	# Deliberately no lifetime "N saved" line. It used to sit under the ring on
	# bare sky, and a lifetime total next to a level fraction reads as a
	# contradiction ("0/2" beside "4 saved") rather than as two facts. Lifetime
	# progress belongs on the completion screen, where it is the subject.
	_apply_theme()

func _load_icon() -> Texture2D:
	if SpriteSheet.has_art(ICON_KEY):
		return SpriteSheet.texture(ICON_KEY)
	if not SpriteSheet.has_art(ICON_FALLBACK_KEY):
		return null
	var atlas := AtlasTexture.new()
	atlas.atlas = SpriteSheet.texture(ICON_FALLBACK_KEY)
	atlas.region = ICON_FALLBACK_REGION
	return atlas

func _apply_theme() -> void:
	if _progress == null:
		return
	_progress.add_theme_color_override("font_color", ThemeManager.get_color_value("owl"))

func _on_level_owls(count: int) -> void:
	_segments = maxi(1, count)
	_filled = 0
	_sweep = 0.0
	_refresh_text()
	queue_redraw()

func _on_owl_saved() -> void:
	_filled = mini(_segments, _filled + 1)
	_refresh_text()

	var tw := create_tween()
	tw.tween_method(_set_sweep, _sweep, float(_filled) / float(_segments), SWEEP_SECONDS) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_callback(func(): UiFx.icon_pop(self))

func _set_sweep(value: float) -> void:
	_sweep = value
	queue_redraw()

func _on_streak_changed(streak: int, paused: bool) -> void:
	_streak = streak
	_streak_paused = paused
	queue_redraw()

func _refresh_text() -> void:
	if _progress == null:
		return
	_progress.text = "%d/%d" % [_filled, _segments]

func _draw() -> void:
	var c := Vector2(EXTENT, EXTENT)
	var ink := ThemeManager.get_color_value("ink")
	var owl := ThemeManager.get_color_value("owl")
	# Thresholds come from fx_tuning so the ring catching fire and the toast
	# announcing it are the same moment, not two nearby ones.
	var flame_at := int(Config.fx("streak/flame", 3))
	var hot_at := int(Config.fx("streak/hot", 5))
	var lit: Color = ThemeManager.get_color_value("coin") if _streak >= flame_at else owl

	# Disc behind the icon, so the owl sits on its own ground rather than on
	# whatever tile happens to be behind it.
	# Opaque, not 0.86: the disc is the floor everything else is measured
	# against, and letting the world bleed through it made that floor move from
	# world to world.
	draw_circle(c, RADIUS - STROKE * 0.5 + 1.0, ink)

	# Dark bezel, then a paper rim. Neither alone works everywhere: the bezel
	# separates the ring from a bright sky, the rim separates it from a
	# near-black one where an ink fill is the same colour as the world.
	draw_arc(c, RADIUS + BEZEL_RADIUS_OFFSET, 0, TAU, 64, Color(ink, 0.92), BEZEL)
	draw_arc(c, RADIUS + BEZEL * 0.5 + RIM * 0.5, 0, TAU, 64,
		Color(ThemeManager.get_color_value("paper"), 0.55), RIM)

	var track := owl.lerp(ink, TRACK_MIX)
	var top := -PI * 0.5

	if _segments > MAX_SEGMENTS:
		# One unbroken track, one unbroken sweep.
		draw_arc(c, RADIUS, 0, TAU, 64, track, STROKE)
		if _sweep > 0.0:
			draw_arc(c, RADIUS, top, top + _sweep * TAU, 64, lit, STROKE)
	else:
		var step := TAU / float(_segments)
		for i in _segments:
			draw_arc(c, RADIUS,
				top + i * step + SEGMENT_GAP_RAD * 0.5,
				top + (i + 1) * step - SEGMENT_GAP_RAD * 0.5,
				32, track, STROKE)

		var sweep_end := top + _sweep * TAU
		for i in _segments:
			var from := top + i * step + SEGMENT_GAP_RAD * 0.5
			var to := minf(top + (i + 1) * step - SEGMENT_GAP_RAD * 0.5, sweep_end)
			if to <= from:
				break
			draw_arc(c, RADIUS, from, to, 32, lit, STROKE)

	if _streak >= flame_at:
		var hot := _streak >= hot_at
		# 40% while paused: the flame is visibly still there, waiting to relight.
		var dim: float = PAUSED_FLAME_ALPHA if _streak_paused else 1.0
		var flame: Color = ThemeManager.get_color_value("notyet") if hot else ThemeManager.get_color_value("coin")
		var dashes := 16 if hot else 12
		for i in dashes:
			var a := top + (float(i) / float(dashes)) * TAU
			draw_arc(c, FLAME_RADIUS, a, a + (TAU / float(dashes)) * 0.5, 6,
				Color(flame, (1.0 if hot else 0.85) * dim),
				FLAME_THICKNESS if hot else FLAME_THICKNESS - 0.5)
