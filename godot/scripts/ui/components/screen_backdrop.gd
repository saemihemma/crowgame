extends Control
class_name ScreenBackdrop
## The living background behind every non-gameplay screen.
##
## Every screen in the game - the one a child sees first, the menu, level select
## - was a flat #87CEEB fill with grey slabs on it. That is a debug page, and it
## was the first impression the whole game made.
##
## Drawn entirely from the active theme's palette rather than from art, for two
## reasons: it costs no assets to look like a place instead of a form, and it
## changes with the world you last played, so the menu remembers where you are.
## When the parallax PNGs in brand/ASSET_MANIFEST.md Priority 1 land, this is the
## node they replace.
##
## brand/BRAND_SYSTEM.md §5.4 (layer stack).

## Silhouette bands, back to front: palette role, how high it sits, how tall its
## rolling profile is, and the phase that keeps the three ridges from lining up.
const BANDS := [
	{"role": "far", "height": 0.46, "amplitude": 26.0, "phase": 0.0, "frequency": 1.1},
	{"role": "mid", "height": 0.62, "amplitude": 34.0, "phase": 2.1, "frequency": 1.7},
	{"role": "deep", "height": 0.78, "amplitude": 22.0, "phase": 4.3, "frequency": 2.6},
]
## Horizontal resolution of a ridge. Low enough to be cheap, high enough that the
## silhouette reads as a curve rather than as a polygon.
const RIDGE_STEPS := 48
## Enough slices that the falloff reads as a gradient rather than as banding.
const VIGNETTE_STEPS := 40
const VIGNETTE_EXTENT := 0.22
const VIGNETTE_DEPTH := 0.34

func _ready() -> void:
	# Anchors AND offsets: setting anchors alone leaves the offsets from whatever
	# size the node was created at, so the first _draw ran against a zero rect and
	# the screen stayed the project's clear colour.
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	z_index = -100
	ThemeManager.theme_changed.connect(func(_id): queue_redraw())
	# `resized` rather than the viewport's size_changed: layout can give this node
	# its real rect a frame after _ready without the window changing at all, and
	# a backdrop that never redraws after that is an invisible backdrop.
	resized.connect(queue_redraw)

func _draw() -> void:
	var w := size.x
	var h := size.y
	if w <= 0.0 or h <= 0.0:
		return

	_draw_sky(w, h)
	for band in BANDS:
		_draw_band(w, h, band)
	_draw_vignette(w, h)

## The sky is the largest region of the screen, so it is what decides whether the
## screen has a mood at all. Two stops from the world's own palette.
func _draw_sky(w: float, h: float) -> void:
	var top := ThemeManager.get_color_value("sky_top")
	var bottom := ThemeManager.get_color_value("sky_bottom")
	var steps := 24
	for i in steps:
		var t := float(i) / float(steps - 1)
		var y := h * float(i) / float(steps)
		draw_rect(Rect2(0.0, y, w, h / float(steps) + 1.0), top.lerp(bottom, t))

## One rolling silhouette, as a filled polygon down to the bottom edge.
func _draw_band(w: float, h: float, band: Dictionary) -> void:
	var base := h * float(band["height"])
	var amplitude: float = band["amplitude"]
	var phase: float = band["phase"]
	var frequency: float = band["frequency"]

	var points := PackedVector2Array()
	for i in RIDGE_STEPS + 1:
		var t := float(i) / float(RIDGE_STEPS)
		var x := w * t
		# Two summed sines: one alone gives an obviously repeating wave, and the
		# second at an irrational-ish ratio stops the ridge looking tiled.
		var y := base \
			- sin(t * TAU * frequency + phase) * amplitude \
			- sin(t * TAU * frequency * 2.37 + phase * 1.7) * amplitude * 0.35
		points.append(Vector2(x, y))
	points.append(Vector2(w, h))
	points.append(Vector2(0.0, h))

	var colour := ThemeManager.get_color_value(String(band["role"]))
	draw_colored_polygon(points, colour)

## Edge falloff. Drawn as many thin horizontal slices, the same way the sky is,
## because the first version used seven concentric inset frames and every one of
## them was visible as a hard rectangle across the sky - it read as a rendering
## bug rather than as depth.
##
## Top and bottom only: darkening the sides as well pinched the composition, and
## every one of these screens puts its content in a centred column that already
## has the middle to itself.
func _draw_vignette(w: float, h: float) -> void:
	var ink := ThemeManager.get_color_value("ink")
	var band := h * VIGNETTE_EXTENT
	var slice := band / float(VIGNETTE_STEPS)
	for i in VIGNETTE_STEPS:
		var t := 1.0 - float(i) / float(VIGNETTE_STEPS)
		var alpha := VIGNETTE_DEPTH * t * t
		draw_rect(Rect2(0.0, slice * float(i), w, slice + 1.0), Color(ink, alpha))
		draw_rect(Rect2(0.0, h - slice * float(i + 1), w, slice + 1.0), Color(ink, alpha))
