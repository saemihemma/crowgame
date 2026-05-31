extends CanvasLayer
## HUD — Godot port of HUDScene (HealthBar/CoinCounter/OwlCounter).
## Driven entirely by EventBus signals so it stays decoupled from gameplay.
## Built in code for now; SkinPack theming arrives in slice 8.

var _lives_label: Label
var _coin_label: Label
var _owl_label: Label

var _coins := 0
var _owls := 0
var _lives := 3

func _ready() -> void:
	layer = 5
	_build()
	_coins = int(SaveManager.get_data().get("coins", 0))
	_owls = int(SaveManager.get_data().get("owlsSaved", 0))
	_refresh()
	EventBus.coins_changed.connect(func(c): _coins = c; _refresh())
	EventBus.owl_saved.connect(func(): _owls += 1; _refresh())
	EventBus.lives_changed.connect(func(l): _lives = l; _refresh())

func _build() -> void:
	var root := MarginContainer.new()
	root.anchor_right = 1.0
	root.anchor_bottom = 1.0
	root.add_theme_constant_override("margin_left", 16)
	root.add_theme_constant_override("margin_top", 12)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	root.add_child(col)
	_lives_label = _make_label()
	_coin_label = _make_label()
	_owl_label = _make_label()
	col.add_child(_lives_label)
	col.add_child(_coin_label)
	col.add_child(_owl_label)

func _make_label() -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size", 22)
	l.add_theme_color_override("font_color", Color.WHITE)
	l.add_theme_color_override("font_shadow_color", Color.BLACK)
	l.add_theme_constant_override("shadow_offset_x", 2)
	l.add_theme_constant_override("shadow_offset_y", 2)
	return l

func _refresh() -> void:
	_lives_label.text = "Lives: " + "*".repeat(maxi(0, _lives))
	_coin_label.text = "Coins " + TextManager.t("hud.coins", [_coins])
	_owl_label.text = "Owls " + TextManager.t("hud.owls", [_owls])
