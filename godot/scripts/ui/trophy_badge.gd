extends Control
class_name TrophyBadge
## Code-drawn trophy badge (mirrors MainMenuScene.drawBadge on the web port).
## Tiers: 0 sprout, 1 leaf, 2 flower, 3 star. Drawn primitives, never glyphs,
## per the i18n house rules. Colours are the badge's identity, not the theme's
## — a sprout is green and a star is gold in every skin.

const GREEN := Color(0.298, 0.686, 0.314)  # hardcode-ok: badge identity colour, not themed
const DARK_GREEN := Color(0.180, 0.490, 0.196)  # hardcode-ok: badge identity colour, not themed
const GOLD := Color(1.0, 0.843, 0.0)  # hardcode-ok: badge identity colour, not themed
const DARK_GOLD := Color(0.722, 0.525, 0.043)  # hardcode-ok: badge identity colour, not themed
const PINK := Color(1.0, 0.541, 0.702)  # hardcode-ok: badge identity colour, not themed

var tier := 0

func _init(badge_tier: int = 0) -> void:
	tier = badge_tier
	custom_minimum_size = Vector2(36, 32)

func _draw() -> void:
	var c := size / 2.0
	match tier:
		0:
			# Sprout: a stem with two small leaves.
			draw_line(c + Vector2(0, 12), c + Vector2(0, -6), GREEN, 3.0)
			_draw_ellipse(c + Vector2(-6, -2), Vector2(6, 3.5), GREEN)
			_draw_ellipse(c + Vector2(6, -8), Vector2(6, 3.5), GREEN)
		1:
			# Leaf: one big leaf on a short stem.
			draw_line(c + Vector2(0, 12), c, GREEN, 3.0)
			_draw_ellipse(c + Vector2(0, -4), Vector2(11, 7), GREEN)
			draw_line(c + Vector2(-9, -4), c + Vector2(9, -4), DARK_GREEN, 2.0)
		2:
			# Flower: five petals around a bright centre.
			for p in 5:
				var a := -PI / 2.0 + p * TAU / 5.0
				draw_circle(c + Vector2(cos(a), sin(a)) * 9.0 + Vector2(0, -2), 6.0, PINK)
			draw_circle(c + Vector2(0, -2), 5.0, GOLD)
		_:
			# Star: five points, gold with a darker outline.
			var pts := PackedVector2Array()
			for p in 10:
				var r := 14.0 if p % 2 == 0 else 6.0
				var a := -PI / 2.0 + p * PI / 5.0
				pts.append(c + Vector2(cos(a), sin(a)) * r + Vector2(0, -2))
			draw_colored_polygon(pts, GOLD)
			var outline := pts.duplicate()
			outline.append(pts[0])
			draw_polyline(outline, DARK_GOLD, 2.0)

func _draw_ellipse(center: Vector2, radii: Vector2, color: Color) -> void:
	var pts := PackedVector2Array()
	for i in 20:
		var a := i * TAU / 20.0
		pts.append(center + Vector2(cos(a) * radii.x, sin(a) * radii.y))
	draw_colored_polygon(pts, color)
