extends Control
class_name HeartRow
## Life, as hearts. brand/BRAND_SYSTEM.md §8.2.

const HEART := 28.0
const GAP := 8.0
const MAX_HEARTS := 3

## The heart silhouette at 2x, as pixel rows. Declared once so the ink outline
## can be a true dilation of it. Stamping a single shifted copy - which an
## earlier build did - leaves a notch on the un-offset corner.
const ROWS: Array[Rect2] = [
	Rect2(4, 0, 12, 8), Rect2(24, 0, 12, 8), Rect2(0, 4, 40, 16),
	Rect2(4, 20, 32, 8), Rect2(8, 28, 24, 4), Rect2(12, 32, 16, 4), Rect2(16, 36, 8, 4),
]
const SOURCE_W := 40.0
const SOURCE_H := 40.0

var _lives := MAX_HEARTS

func _ready() -> void:
	custom_minimum_size = Vector2(MAX_HEARTS * HEART + (MAX_HEARTS - 1) * GAP, HEART)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_lives = MAX_HEARTS
	EventBus.lives_changed.connect(func(l): _lives = l; queue_redraw())
	EventBus.player_hurt.connect(_on_hurt)
	ThemeManager.theme_changed.connect(func(_id): queue_redraw())

## A hit shakes the row. The hearts themselves are redrawn by lives_changed.
func _on_hurt() -> void:
	var origin := position
	var tw := create_tween()
	for i in 4:
		tw.tween_property(self, "position:x", origin.x + (4.0 if i % 2 == 0 else -4.0), 0.04)
	tw.tween_property(self, "position:x", origin.x, 0.04)

func _draw() -> void:
	var scale := HEART / SOURCE_W
	var ink := ThemeManager.get_color_value("ink")
	var hurt := ThemeManager.get_color_value("hurt")

	for i in MAX_HEARTS:
		var origin := Vector2(i * (HEART + GAP), 0)
		var full := i < _lives

		# Outline first: the silhouette stamped at four offsets, which dilates
		# it by 2px on every side. Required by §5.3 - without it the hearts
		# disappear against a bright world.
		for offset in [Vector2(-2, 0), Vector2(2, 0), Vector2(0, -2), Vector2(0, 2)]:
			for r in ROWS:
				draw_rect(Rect2(origin + (r.position + offset) * scale, r.size * scale), ink)

		# An empty slot keeps its outline so the count reads at a glance.
		if not full:
			continue
		for r in ROWS:
			draw_rect(Rect2(origin + r.position * scale, r.size * scale), hurt)
