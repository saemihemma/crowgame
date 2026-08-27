extends CanvasLayer
## HUD — three pods, per brand/BRAND_SYSTEM.md §8.2.
##
## Life on the left, the owl ring on the right, a coin chip that fades when
## nothing is happening, and a deliberately empty top centre — which is what
## makes a streak toast read as an event rather than as more HUD.
##
## What this replaced: three stacked labels reading "Lives: *** / Coins 20 /
## Owls 4", which gave the entire goal of the game the same visual authority as
## a debug readout, at a 16px margin inside the 32px touch safe area.

const MARGIN := 24.0
const TOUCH_MARGIN := 32.0
## Vertical breathing room between the two halves of the left pod.
const POD_GAP := 14.0

## Only used to detect a milestone crossing; the chip owns the displayed value.
var _coins := 0

var _hearts: HeartRow
var _coin_chip: CoinChip
var _owl_ring: OwlRing
var _big_coins: PipRow

func _ready() -> void:
	layer = 5
	_build()
	_build_big_coin_row()
	_build_ability_row()
	_coins = int(SaveManager.get_data().get("coins", 0))
	EventBus.coins_changed.connect(_on_coins_changed)
	EventBus.big_coins_changed.connect(_on_big_coins_changed)
	EventBus.ability_granted.connect(_on_ability_granted)
	EventBus.ability_revoked.connect(_on_ability_revoked)
	EventBus.curriculum_step_up.connect(_on_curriculum_step_up)
	EventBus.math_comeback.connect(_on_math_comeback)
	# The coin chip renders "x{0}" through TextManager, so a mid-level language
	# switch has to reach it. The pods restyle themselves on theme_changed - each
	# component connects it - so there is nothing to do for a world change here.
	TextManager.locale_changed.connect(func(_code: String) -> void: _on_locale_changed())

## The safe area is wider on touch, to clear rounded corners and gesture bars.
func _margin() -> float:
	return TOUCH_MARGIN if DisplayServer.is_touchscreen_available() else MARGIN

func _build() -> void:
	var m := _margin()

	# LEFT POD — life.
	_hearts = HeartRow.new()
	_hearts.position = Vector2(m, m)
	add_child(_hearts)

	# Coin chip under the hearts. Idle-fades on its own. The gap is derived from
	# the heart row rather than guessed, so changing the heart size cannot leave
	# the two pod halves crowding or drifting apart.
	_coin_chip = CoinChip.new()
	_coin_chip.position = Vector2(m, m + HeartRow.HEART + POD_GAP)
	add_child(_coin_chip)

	# RIGHT POD — the owl ring: the goal anchor, and the biggest thing on the
	# HUD. Anchored right so it holds the corner at any viewport width. Offsets
	# rather than position: an anchored Control derives its rect from offsets,
	# and OwlRing.EXTENT (not RADIUS) is the real outer edge of its ink.
	_owl_ring = OwlRing.new()
	_owl_ring.anchor_left = 1.0
	_owl_ring.anchor_right = 1.0
	_owl_ring.offset_left = -m - OwlRing.EXTENT * 2.0
	_owl_ring.offset_right = -m
	_owl_ring.offset_top = m
	_owl_ring.offset_bottom = m + OwlRing.EXTENT * 2.0
	add_child(_owl_ring)

# ─── Ability slots ─────────────────────────────────────────
var _ability_row: HBoxContainer
var _ability_chips: Dictionary = {}  # abilityId -> Label

## Under the coin chip, in the LEFT pod.
##
## It used to anchor to the bottom right, on the reasoning that the top right
## belongs to the owl ring -- which is true, and skipped the question of what was
## already in the bottom right. The jump and shoot buttons are, and the first
## screenshot ever taken of a granted ability (godot/tools/capture.sh hud-ability)
## shows "Double Jump" printed across the jump button. Nothing had ever drawn a
## chip and a control at the same time.
##
## The left pod is where it belonged anyway: hearts, coins and abilities are all
## answers to "what do I have", and §8.2 gives that column to exactly that. The
## gap is derived from the two things above it rather than guessed, so resizing a
## heart or the chip cannot leave the three crowding.
## This run's big coins, directly under the owl ring.
##
## It belongs beside the ring rather than beside the coin chip, because it is the
## same KIND of fact: how close am I to finishing this level. The coin chip is a
## lifetime purse and only ever rises; these three reset with the run, and a child
## who cannot see them has no way to know the level holds any.
##
## Hidden when the level holds none, so the practice arena does not carry an empty
## promise.
func _build_big_coin_row() -> void:
	_big_coins = PipRow.make(3, 0, "coin", "coin", true)
	_big_coins.anchor_left = 1.0
	_big_coins.anchor_right = 1.0
	_big_coins.visible = false
	add_child(_big_coins)
	_place_big_coin_row()

## Right-anchored by offsets, like the ring above it, and positioned FROM the
## ring rather than from a guessed number -- so changing OwlRing.EXTENT moves both
## instead of leaving a gap that nobody notices until a screenshot.
func _place_big_coin_row() -> void:
	if _big_coins == null:
		return
	var m := _margin()
	var w := _big_coins.custom_minimum_size.x
	var h := _big_coins.custom_minimum_size.y
	_big_coins.offset_left = -m - w
	_big_coins.offset_right = -m
	_big_coins.offset_top = m + OwlRing.EXTENT * 2.0 + POD_GAP
	_big_coins.offset_bottom = _big_coins.offset_top + h

func _on_big_coins_changed(found: int, total: int) -> void:
	if _big_coins == null:
		return
	_big_coins.visible = total > 0
	if total <= 0:
		return
	_big_coins.set_counts(total, found)
	_place_big_coin_row()
	if found > 0:
		UiFx.icon_pop(_big_coins)

func _build_ability_row() -> void:
	_ability_row = HBoxContainer.new()
	_ability_row.add_theme_constant_override("separation", 8)
	_ability_row.position = Vector2(_margin(),
		_margin() + HeartRow.HEART + POD_GAP + CoinChip.HEIGHT + POD_GAP)
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

## The chip renders its own count; the HUD only owns the milestone celebration.
func _on_coins_changed(c: int) -> void:
	var crossed_milestone := c > _coins and (Config.ui("hud/coin_milestones", [10, 25, 50, 100]) as Array).has(c)
	_coins = c
	if not crossed_milestone:
		return
	AudioManager.play_event("milestone")
	var at := _coin_chip.global_position + Vector2(_coin_chip.size.x * 0.5, 16)
	DopamineFX.burst(self, at, ThemeManager.get_color_value("coin"), 20)
	# tp(), not t(): Icelandic inflects the noun on the numeral, so "21 myntir"
	# has to become "21 mynt". t() has no plural path.
	DopamineFX.number_fly_up(self, at + Vector2(0, -12),
		TextManager.tp("hud.coins_milestone", {"n": c}, "n"))

## A curriculum step was cleared. The banner lands in the empty top centre, which
## is what the three-pod layout keeps free so an event reads as an event.
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
	DopamineFX.burst(self, center, ThemeManager.get_color_value("coin"), 24)
	DopamineFX.number_fly_up(self, center, banner, ThemeManager.get_color_value("coin"))

## Only the coin chip carries text; the hearts and the ring are shapes.
func _on_locale_changed() -> void:
	if is_instance_valid(_coin_chip):
		_coin_chip.refresh_text()
