extends Button
class_name WorldCard
## One world on the level-select screen.
##
## What this replaced: six identical grey slabs reading "Forest Clearing",
## "Crystal Cave", "Sunny Meadow (Locked)". They told a child nothing about where
## they were about to go, and the names did not even match the worlds the art
## bible describes.
##
## A card paints itself in its *own* world's palette - its sky, its ridges - so
## five worlds read as five places at a glance, before a word is read. That is
## the entire argument for a themed level select: choosing where to go should
## feel like looking at somewhere.
##
## brand/LEVEL_ART_BIBLE.md (the five worlds), brand/BRAND_SYSTEM.md §6.

const SIZE := Vector2(252.0, 286.0)
const RIDGE_STEPS := 24
## Where the two silhouette ridges sit, as a fraction of card height.
const RIDGE_MID := 0.60
const RIDGE_DEEP := 0.74
const OWL_DOT := 13.0
const OWL_GAP := 7.0
## Above this, a row of dots stops being countable and starts overflowing the
## card - the practice arena has twenty owls and its row drew clean off both
## edges. Past the cap it becomes one owl and a number.
const OWL_DOTS_MAX := 8
const LOCK_SCRIM := 0.62

var level_key := ""
var theme_id := ""
var owls := 0
var unlocked := true
var completed := false

static func make(key: String, entry: Dictionary, is_unlocked: bool, is_complete: bool, on_press: Callable) -> WorldCard:
	var card := WorldCard.new()
	card.level_key = key
	card.theme_id = String(entry.get("theme", ""))
	card.owls = LevelManager.owl_count(key)
	card.unlocked = is_unlocked
	card.completed = is_complete
	card.disabled = not is_unlocked
	if is_unlocked and on_press.is_valid():
		card.pressed.connect(on_press)
	return card

func _ready() -> void:
	custom_minimum_size = SIZE
	focus_mode = Control.FOCUS_ALL if unlocked else Control.FOCUS_NONE
	# The card paints itself; Button's own faces would draw a grey slab over it.
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		add_theme_stylebox_override(state, StyleBoxEmpty.new())
	_build_labels()
	ThemeManager.theme_changed.connect(func(_id): queue_redraw())
	focus_entered.connect(queue_redraw)
	focus_exited.connect(queue_redraw)

func _colour(key: String) -> Color:
	return ThemeManager.get_color_value_of(theme_id, key)

func _build_labels() -> void:
	var name_label := Label.new()
	var name_key := "level.%s.name" % level_key
	name_label.text = TextManager.t(name_key) if TextManager.has(name_key) else level_key
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	name_label.add_theme_font_size_override("font_size", 26)
	name_label.add_theme_color_override("font_color", _colour("paper"))
	name_label.add_theme_color_override("font_shadow_color", _colour("ink"))
	name_label.add_theme_constant_override("shadow_offset_x", 2)
	name_label.add_theme_constant_override("shadow_offset_y", 3)
	name_label.position = Vector2(14.0, 18.0)
	name_label.size = Vector2(SIZE.x - 28.0, 70.0)
	name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(name_label)

	var status := Label.new()
	status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status.add_theme_font_size_override("font_size", 20)
	status.add_theme_constant_override("shadow_offset_x", 2)
	status.add_theme_constant_override("shadow_offset_y", 2)
	status.add_theme_color_override("font_shadow_color", _colour("ink"))
	if not unlocked:
		status.text = TextManager.t("level_select.locked")
		status.add_theme_color_override("font_color", _colour("paper"))
	elif completed:
		status.text = TextManager.t("level_select.complete")
		status.add_theme_color_override("font_color", _colour("yes"))
	else:
		status.text = TextManager.t("level_select.ready")
		status.add_theme_color_override("font_color", _colour("coin"))
	if owls > OWL_DOTS_MAX:
		var many := Label.new()
		many.text = TextManager.t("level_select.owl_count", [owls])
		many.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		many.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		many.add_theme_font_size_override("font_size", 26)
		many.add_theme_color_override("font_color", _colour("owl"))
		many.add_theme_color_override("font_shadow_color", _colour("ink"))
		many.add_theme_constant_override("shadow_offset_x", 2)
		many.add_theme_constant_override("shadow_offset_y", 2)
		many.position = Vector2(SIZE.x * 0.5 - 6.0, SIZE.y * 0.5 + 24.0 - 18.0)
		many.size = Vector2(80.0, 36.0)
		many.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(many)

	status.position = Vector2(14.0, SIZE.y - 46.0)
	status.size = Vector2(SIZE.x - 28.0, 28.0)
	status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(status)

func _draw() -> void:
	var w := SIZE.x
	var h := SIZE.y
	var ink := _colour("ink")

	# Sky, in this world's own two stops.
	var top := _colour("sky_top")
	var bottom := _colour("sky_bottom")
	var steps := 20
	for i in steps:
		var t := float(i) / float(steps - 1)
		draw_rect(Rect2(0.0, h * float(i) / float(steps), w, h / float(steps) + 1.0), top.lerp(bottom, t))

	_draw_ridge(w, h, h * RIDGE_MID, _colour("mid"), 14.0, 0.0)
	_draw_ridge(w, h, h * RIDGE_DEEP, _colour("deep"), 10.0, 2.4)

	if unlocked:
		_draw_owls(w, h)
	else:
		# Locked worlds are dimmed rather than hidden: seeing where you are going
		# next is most of the reason to keep going.
		draw_rect(Rect2(0.0, 0.0, w, h), Color(ink, LOCK_SCRIM))

	# Frame last, over everything, so the card reads as one object. Focus
	# thickens and brightens it rather than resizing the card, which would shove
	# the whole row sideways.
	var focused := has_focus()
	draw_rect(Rect2(2.0, 2.0, w - 4.0, h - 4.0),
		ThemeManager.get_color_value("focus") if focused else ink,
		false, 6.0 if focused else 4.0)

func _draw_ridge(w: float, h: float, base: float, colour: Color, amplitude: float, phase: float) -> void:
	var points := PackedVector2Array()
	for i in RIDGE_STEPS + 1:
		var t := float(i) / float(RIDGE_STEPS)
		points.append(Vector2(w * t, base - sin(t * TAU + phase) * amplitude))
	points.append(Vector2(w, h))
	points.append(Vector2(0.0, h))
	draw_colored_polygon(points, colour)

## One dot per owl waiting in this world. A number would be faster to read for an
## adult; a row of owls is faster for someone who is still learning to - up to
## the point where the row is too long to count, which is what the cap is for.
func _draw_owls(w: float, h: float) -> void:
	if owls <= 0:
		return
	var y := h * 0.5 + 24.0
	var fill := _colour("owl")
	var edge := _colour("ink")

	if owls > OWL_DOTS_MAX:
		_draw_owl_dot(Vector2(w * 0.5 - 26.0, y), fill, edge)
		return

	var total := float(owls) * OWL_DOT * 2.0 + float(owls - 1) * OWL_GAP
	var x := (w - total) * 0.5 + OWL_DOT
	for i in owls:
		_draw_owl_dot(Vector2(x + float(i) * (OWL_DOT * 2.0 + OWL_GAP), y), fill, edge)

func _draw_owl_dot(at: Vector2, fill: Color, edge: Color) -> void:
	draw_circle(at, OWL_DOT, fill)
	draw_arc(at, OWL_DOT, 0, TAU, 24, edge, 2.5)
