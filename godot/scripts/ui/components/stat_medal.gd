extends Control
class_name StatMedal
## One headline number on a results screen.
##
## The run-complete screen used to state everything a child had achieved in a
## single 26px line: "Owls saved: 19   Coins: 110". That is a receipt. The
## numbers a player earned should be the largest thing on the screen that
## celebrates them, which is what this is for.
##
## brand/BRAND_SYSTEM.md §10 (dopamine economy).

const SIZE := Vector2(196.0, 148.0)
const CORNER := 22.0
const ICON := 40.0
const COUNT_UP_SECONDS := 0.9

var _value := 0
var _count: Label
var _shown := 0

static func make(icon: Texture2D, value: int, caption: String, tint_role: String) -> StatMedal:
	var medal := StatMedal.new()
	medal._value = value
	medal._build(icon, caption, tint_role)
	return medal

func _build(icon: Texture2D, caption: String, tint_role: String) -> void:
	custom_minimum_size = SIZE
	size = SIZE
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	if icon != null:
		var art := TextureRect.new()
		art.texture = icon
		art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		art.size = Vector2(ICON, ICON)
		art.position = Vector2((SIZE.x - ICON) * 0.5, 14.0)
		art.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(art)

	_count = Label.new()
	_count.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_count.add_theme_font_size_override("font_size", 46)
	_count.add_theme_color_override("font_color", ThemeManager.get_color_value(tint_role))
	_count.position = Vector2(0.0, 58.0)
	_count.size = Vector2(SIZE.x, 56.0)
	_count.text = "0"
	add_child(_count)

	var label := Label.new()
	label.text = caption
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 18)
	label.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	label.position = Vector2(0.0, SIZE.y - 34.0)
	label.size = Vector2(SIZE.x, 24.0)
	add_child(label)

func _ready() -> void:
	_start_count()

## The number rolls up rather than appearing. A total that lands instantly is
## information; a total that climbs is a small event, and this screen exists to
## make the run feel like it was worth something.
func _start_count() -> void:
	if UiFx.reduced_motion() or _value <= 0:
		_shown = _value
		_count.text = str(_value)
		return
	create_tween().tween_method(_set_shown, 0, _value, COUNT_UP_SECONDS) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)

func _set_shown(value: int) -> void:
	_shown = value
	if _count != null:
		_count.text = str(value)

func _draw() -> void:
	var ink := ThemeManager.get_color_value("ink")
	var paper := ThemeManager.get_color_value("paper")
	var box := StyleBoxFlat.new()
	box.bg_color = Color(ink, 0.78)
	box.set_corner_radius_all(int(CORNER))
	box.set_border_width_all(3)
	box.border_color = Color(paper, 0.5)
	draw_style_box(box, Rect2(Vector2.ZERO, SIZE))
