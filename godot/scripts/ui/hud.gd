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
	_build_ability_row()
	_coins = int(SaveManager.get_data().get("coins", 0))
	_owls = int(SaveManager.get_data().get("owlsSaved", 0))
	_refresh()
	EventBus.coins_changed.connect(_on_coins_changed)
	EventBus.owl_saved.connect(func(): _owls += 1; _refresh())
	EventBus.lives_changed.connect(func(l): _lives = l; _refresh())
	EventBus.player_hurt.connect(_shake_lives)
	EventBus.ability_granted.connect(_on_ability_granted)
	EventBus.ability_revoked.connect(_on_ability_revoked)
	EventBus.curriculum_step_up.connect(_on_curriculum_step_up)
	EventBus.math_comeback.connect(_on_math_comeback)
	ThemeManager.theme_changed.connect(func(_id): _apply_theme())
	# hud.lives / hud.coins_label / hud.owls_label all differ between locales
	# ("Lives:" vs "Líf:", "Coins" vs "Mynt", "Owls" vs "Uglur"), and _refresh()
	# already re-reads all three, so a locale change needs nothing new.
	TextManager.locale_changed.connect(func(_code: String) -> void: _refresh())
	_apply_theme()

# ─── AbilitySlots (top-right, AbilitySlots.ts) ─────────────
var _ability_row: HBoxContainer
var _ability_chips: Dictionary = {}  # abilityId -> Label

func _build_ability_row() -> void:
	_ability_row = HBoxContainer.new()
	_ability_row.add_theme_constant_override("separation", 8)
	_ability_row.anchor_left = 1.0
	_ability_row.anchor_right = 1.0
	_ability_row.offset_left = -176
	_ability_row.offset_top = 16
	_ability_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_ability_row)

func _on_ability_granted(payload: Dictionary) -> void:
	var id := String(payload.get("abilityId", ""))
	if id == "" or _ability_chips.has(id):
		return
	var chip := Label.new()
	chip.text = id.capitalize()
	chip.add_theme_font_size_override("font_size", 16)
	chip.add_theme_color_override("font_color", ThemeManager.get_color_value("accent"))
	chip.add_theme_color_override("font_shadow_color", Color.BLACK)
	_ability_row.add_child(chip)
	_ability_chips[id] = chip
	AudioManager.play_event("ability")
	UiFx.elastic_entrance.call_deferred(chip)

func _on_ability_revoked(payload: Dictionary) -> void:
	var id := String(payload.get("abilityId", ""))
	if _ability_chips.has(id):
		_ability_chips[id].queue_free()
		_ability_chips.erase(id)

func _on_coins_changed(c: int) -> void:
	var crossed_milestone := c > _coins and (Config.ui("hud/coin_milestones", [10, 25, 50, 100]) as Array).has(c)
	_coins = c
	_refresh()
	if crossed_milestone:
		# CoinCounter.ts milestone burst at 10/25/50/100.
		AudioManager.play_event("milestone")
		DopamineFX.burst(self, _coin_label.global_position + Vector2(80, 12), ThemeManager.get_color_value("coin"), 20)
		DopamineFX.number_fly_up(self, _coin_label.global_position + Vector2(110, 0), TextManager.t("hud.coins_milestone", [c]))

## Celebrate a curriculum step-up (HUDScene.ts showStepUpBanner). Up-moves
## only — demotions are deliberately never signaled to the child.
func _on_curriculum_step_up(payload: Dictionary) -> void:
	var domain := String(payload.get("domain", ""))
	_show_celebration_banner(TextManager.t("math.step_up", [TextManager.t("domain." + domain)]))

## The redemption arc: a skill missed earlier was just beaten on its
## scheduled return. Celebrated harder than an ordinary win.
func _on_math_comeback(_payload: Dictionary) -> void:
	_show_celebration_banner(TextManager.t("math.comeback"))

func _show_celebration_banner(banner: String) -> void:
	var center := Vector2(get_viewport().get_visible_rect().size.x / 2.0, 120.0)
	AudioManager.play_event("milestone")
	DopamineFX.burst(self, center, ThemeManager.get_color_value("accent"), 24)
	DopamineFX.number_fly_up(self, center, banner, ThemeManager.get_color_value("accent"))

## HealthBar.ts shakes the bar on hurt.
func _shake_lives() -> void:
	if _lives_label == null:
		return
	var origin := _lives_label.position
	var tw := _lives_label.create_tween()
	for i in 4:
		tw.tween_property(_lives_label, "position:x", origin.x + (4 if i % 2 == 0 else -4), 0.04)
	tw.tween_property(_lives_label, "position:x", origin.x, 0.04)

func _apply_theme() -> void:
	# Tier-3: HUD accents follow the active skin's palette (restyle on swap).
	var accent := ThemeManager.get_color_value("accent")
	_coin_label.add_theme_color_override("font_color", accent)
	_owl_label.add_theme_color_override("font_color", accent)

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
	_lives_label.text = TextManager.t("hud.lives", ["*".repeat(maxi(0, _lives))])
	_coin_label.text = TextManager.t("hud.coins_label", [_coins])
	_owl_label.text = TextManager.t("hud.owls_label", [_owls])
