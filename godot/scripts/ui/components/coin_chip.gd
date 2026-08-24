extends Control
class_name CoinChip
## Coin count as a pill that gets out of the way on its own.
##
## Ink fill AND a paper rim, because neither alone works in every world: the
## fill separates the chip from Emberwood's peach dawn, the rim separates it
## from Sugarstorm's near-black carnival sky where an ink fill is the same
## colour as the world. brand/BRAND_SYSTEM.md §8.6b.

const HEIGHT := 34.0
const RADIUS := 17.0
## Not lower: below about half, the count stops being readable at a glance and
## the chip has gone past "out of the way" into "gone".
const IDLE_ALPHA := 0.55
const IDLE_AFTER := 3.0

## Internal layout. Written out rather than inlined because the pill width is
## derived from these, and the first build drew the pill from one set of numbers
## and measured its width from another - which is why "x20" hung off the end.
const PAD_LEFT := 10.0
const PAD_RIGHT := 14.0
const ICON := 22.0
const ICON_GAP := 8.0
const COIN_FRAME := 32

var _coins := 0
var _label: Label
var _icon: TextureRect
var _idle_timer: SceneTreeTimer = null

func _ready() -> void:
	custom_minimum_size = Vector2(96, HEIGHT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	var coin_texture := load("res://assets/sprites/ui/coin/coinsprite-runtime-32.png")
	if coin_texture != null:
		# The sheet is a 3x3 spin cycle. Handing the whole sheet to a TextureRect
		# renders all nine frames shrunk into one 22px box, which is what the
		# first build shipped: the coin icon read as a smear of gold noise. An
		# atlas region picks the single rest frame.
		var frame := AtlasTexture.new()
		frame.atlas = coin_texture
		frame.region = Rect2(0, 0, COIN_FRAME, COIN_FRAME)
		_icon = TextureRect.new()
		_icon.texture = frame
		_icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		_icon.size = Vector2(ICON, ICON)
		_icon.position = Vector2(PAD_LEFT, (HEIGHT - ICON) * 0.5)
		_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(_icon)

	# No drop shadow. The pill under the text is what buys its contrast (§8.6b);
	# a shadow on top of a plate only thickens the glyphs.
	_label = Label.new()
	_label.add_theme_font_size_override("font_size", 20)
	_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_label.position = Vector2(PAD_LEFT + ICON + ICON_GAP, 0)
	_label.size.y = HEIGHT
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_label)

	_coins = int(SaveManager.get_data().get("coins", 0))
	_refresh()
	modulate.a = IDLE_ALPHA

	EventBus.coins_changed.connect(_on_coins_changed)
	ThemeManager.theme_changed.connect(func(_id): _apply_theme(); queue_redraw())
	_apply_theme()

func _apply_theme() -> void:
	_label.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))

func _on_coins_changed(coins: int) -> void:
	_coins = coins
	_refresh()
	_wake()

## Snap to full on a coin, then fade back once things go quiet. Idle-fade is how
## the HUD stays out of the way without needing a settings toggle.
func _wake() -> void:
	modulate.a = 1.0
	_idle_timer = get_tree().create_timer(IDLE_AFTER)
	var mine := _idle_timer
	await mine.timeout
	if _idle_timer != mine or not is_inside_tree():
		return                                   # a newer coin restarted the wait
	create_tween().tween_property(self, "modulate:a", IDLE_ALPHA, 0.4)

func _refresh() -> void:
	_label.text = TextManager.t("hud.coins", [_coins])
	# The pill hugs its label, so "x0" and "x1284" both look deliberate. Same
	# arithmetic the pill is drawn from, so the two cannot drift apart.
	custom_minimum_size.x = maxf(84.0, _label.position.x + _label.get_minimum_size().x + PAD_RIGHT)
	size.x = custom_minimum_size.x
	queue_redraw()

func _draw() -> void:
	draw_style_box(_pill(ThemeManager.get_color_value("ink")), Rect2(Vector2.ZERO, Vector2(size.x, HEIGHT)))

func _pill(fill: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(fill, 0.78)
	box.corner_radius_top_left = int(RADIUS)
	box.corner_radius_top_right = int(RADIUS)
	box.corner_radius_bottom_left = int(RADIUS)
	box.corner_radius_bottom_right = int(RADIUS)
	box.border_width_left = 1
	box.border_width_right = 1
	box.border_width_top = 1
	box.border_width_bottom = 1
	box.border_color = Color(ThemeManager.get_color_value("paper"), 0.22)
	return box

## Re-read the label through TextManager. Called when the language changes
## mid-level: the chip's "x{0}" comes from the string table like everything else.
func refresh_text() -> void:
	_refresh()
