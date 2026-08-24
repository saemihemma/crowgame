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
## How far the outermost ink reaches from the centre. The control box is sized
## from this rather than from RADIUS: the first build laid out a 61px box around
## 64px of drawing, so the bezel spilled outside its own bounds and the anchored
## right edge sat a few pixels off the margin it claimed to honour.
const EXTENT := RADIUS + BEZEL * 0.5 + BEZEL_RADIUS_OFFSET + RIM

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
const SWEEP_SECONDS := 0.4

const ICON_SIZE := 30.0
## Preferred dedicated icon; the ring falls back to a head crop of the world
## sprite until it exists. Drop a file here and the ring picks it up with no
## code change (brand/ASSET_MANIFEST.md P1).
const ICON_PATH := "res://assets/sprites/ui/hud/owl-icon-32.png"
const ICON_FALLBACK := "res://assets/sprites/characters/npcs/owl-runtime-64.png"
## Head-and-shoulders window into the world sprite. The full 64px owl is in
## chains holding a padlock; shrunk to 30px that detail collapses into noise,
## and a HUD icon has one job — say "owl" in a glance.
const ICON_FALLBACK_REGION := Rect2(10, 3, 44, 34)

var _segments := 3
var _filled := 0
## Animated 0..1 around the whole ring, so a rescue can be tweened.
var _sweep := 0.0
var _streak := 0

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
	if ResourceLoader.exists(ICON_PATH):
		return load(ICON_PATH)
	if not ResourceLoader.exists(ICON_FALLBACK):
		return null
	var atlas := AtlasTexture.new()
	atlas.atlas = load(ICON_FALLBACK)
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

func _on_streak_changed(streak: int) -> void:
	_streak = streak
	queue_redraw()

func _refresh_text() -> void:
	if _progress == null:
		return
	_progress.text = "%d/%d" % [_filled, _segments]

func _draw() -> void:
	var c := Vector2(EXTENT, EXTENT)
	var ink := ThemeManager.get_color_value("ink")
	var owl := ThemeManager.get_color_value("owl")
	var lit: Color = ThemeManager.get_color_value("coin") if _streak >= 3 else owl

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
	var step := TAU / float(_segments)
	var top := -PI * 0.5

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

	if _streak >= 3:
		var hot := _streak >= 5
		var flame: Color = ThemeManager.get_color_value("notyet") if hot else ThemeManager.get_color_value("coin")
		var dashes := 16 if hot else 12
		for i in dashes:
			var a := top + (float(i) / float(dashes)) * TAU
			draw_arc(c, RADIUS + 6.0, a, a + (TAU / float(dashes)) * 0.5, 6,
				Color(flame, 0.7 if hot else 0.45), 2.0 if hot else 1.5)
