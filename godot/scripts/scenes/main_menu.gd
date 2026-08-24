extends Control
## MainMenu — the game's first impression once a player is signed in.
##
## What this replaced: a flat #87CEEB page with a white system-font title and two
## identical grey slabs reading "> PLAY" and "> CONTINUE". Nothing on it said
## which button mattered, nothing said what the game was, and nothing looked like
## it belonged to Hörmann.
##
## Three decisions carry this screen:
##
## 1. The backdrop is the world you last played, so the menu is a place rather
##    than a page - and it changes as you get further in.
## 2. Exactly one primary action. PLAY is coin-yellow and breathes; everything
##    else is quieter. A child should never have to choose which button is the
##    button.
## 3. Continue says *where* you are and *how many owls you have brought home*.
##    Progress is the reason anyone comes back, and it was invisible.

const TITLE_SIZE := 92
const SUBTITLE_SIZE := 26
const COLUMN_SEPARATION := 18

func _ready() -> void:
	BrandTheme.apply(self)
	add_child(ScreenBackdrop.new())
	_add_hero()

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", COLUMN_SEPARATION)
	center.add_child(col)

	_build_wordmark(col)

	var first: BrandButton = null
	first = _add(col, TextManager.t("menu.play"), BrandButton.Role.PRIMARY, _on_play)

	if SaveManager.has_save():
		var resume := _add(col, _continue_label(), BrandButton.Role.SECONDARY, _on_continue)
		if first == null:
			first = resume

	if ProfileManager.get_active_user() != null:
		_add(col, TextManager.t("menu.switch_user"), BrandButton.Role.GHOST, _on_switch_user)

	if first != null:
		first.grab_focus.call_deferred()

	# Language selector, top-right, out of the way of the centred column.
	add_child(LanguageToggle.build(_on_locale_changed))
	_add_build_stamp()

## Title plus the core promise from brand/BRAND_SYSTEM.md §1. The subtitle used
## to read "A Math Adventure", which describes the genre to an adult; the promise
## describes what happens to you, which is what a seven-year-old is buying.
func _build_wordmark(col: VBoxContainer) -> void:
	var title := Label.new()
	title.text = TextManager.t("menu.title")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", TITLE_SIZE)
	title.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	title.add_theme_color_override("font_shadow_color", ThemeManager.get_color_value("ink"))
	title.add_theme_constant_override("shadow_offset_x", 4)
	title.add_theme_constant_override("shadow_offset_y", 5)
	col.add_child(title)

	# The hero's scarf colour, as a rule under the wordmark. The only place `hero`
	# red appears outside Hörmann himself (§6.2), which is what makes it read as
	# his signature rather than as decoration.
	var rule := ColorRect.new()
	rule.color = ThemeManager.get_color_value("hero")
	rule.custom_minimum_size = Vector2(180, 5)
	rule.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	col.add_child(rule)

	var subtitle := Label.new()
	subtitle.text = TextManager.t("menu.subtitle")
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	subtitle.add_theme_font_size_override("font_size", SUBTITLE_SIZE)
	subtitle.add_theme_color_override("font_color", ThemeManager.get_color_value("owl"))
	subtitle.add_theme_color_override("font_shadow_color", ThemeManager.get_color_value("ink"))
	subtitle.add_theme_constant_override("shadow_offset_x", 2)
	subtitle.add_theme_constant_override("shadow_offset_y", 2)
	col.add_child(subtitle)

## Hörmann himself, perched on the ridge line. He was not on his own title
## screen - the game was named after a character the first screen never showed.
##
## Right of the centred column and low, so he shares the frame with the wordmark
## instead of competing with it, and scaled 2x because a 64px sprite on a 960px
## screen reads as a speck.
const HERO_SPRITE := "res://assets/sprites/characters/crow2/crow3/crow1-64px-fixed.png"
const HERO_SCALE := 2.0
const HERO_BOB_PIXELS := 5.0
const HERO_BOB_SECONDS := 2.4

func _add_hero() -> void:
	if not ResourceLoader.exists(HERO_SPRITE):
		return
	var hero := TextureRect.new()
	hero.texture = load(HERO_SPRITE)
	hero.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	hero.custom_minimum_size = Vector2(64.0 * HERO_SCALE, 64.0 * HERO_SCALE)
	hero.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Anchored to the bottom-right corner so he keeps his footing on the ridge at
	# any viewport width rather than drifting into the middle of the sky.
	hero.anchor_left = 1.0
	hero.anchor_right = 1.0
	hero.anchor_top = 1.0
	hero.anchor_bottom = 1.0
	hero.offset_left = -172.0
	hero.offset_top = -196.0
	hero.offset_right = -172.0 + 64.0 * HERO_SCALE
	hero.offset_bottom = -196.0 + 64.0 * HERO_SCALE
	add_child(hero)

	if UiFx.reduced_motion():
		return
	# A slow breath. He is standing still, not idling in an animation loop - the
	# walk sheet here would read as running on the spot.
	var base := hero.position.y
	var tw := hero.create_tween().set_loops()
	tw.tween_property(hero, "position:y", base - HERO_BOB_PIXELS, HERO_BOB_SECONDS * 0.5) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.tween_property(hero, "position:y", base, HERO_BOB_SECONDS * 0.5) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

func _add(parent: Node, text: String, role: int, cb: Callable) -> BrandButton:
	var b := BrandButton.make(text, role, cb)
	b.custom_minimum_size.x = 340
	b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	parent.add_child(b)
	return b

## "Emberwood · 4 owls home" rather than a bare "CONTINUE". The one number a
## returning player wants is how many owls they have.
func _continue_label() -> String:
	var save := SaveManager.get_data()
	var key := resolve_continue_key(save)
	var owls := int(save.get("owlsSaved", 0))
	return TextManager.t("menu.continue_detail", [_world_name(key), owls])

func _world_name(key: String) -> String:
	var name_key := "level.%s.name" % key
	if TextManager.has(name_key):
		return TextManager.t(name_key)
	var entry: Variant = LevelManager.get_level(key)
	return String(entry.get("name", key)) if entry != null else key

func _on_locale_changed() -> void:
	SceneRouter.goto("main_menu")

## Tiny build stamp (bottom-right) so phone refreshes visibly confirm a new
## build during fast iteration. Written by tools/build_web.sh.
func _add_build_stamp() -> void:
	if not FileAccess.file_exists("res://build_info.json"):
		return
	var f := FileAccess.open("res://build_info.json", FileAccess.READ)
	var info: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	if not (info is Dictionary):
		return
	var l := Label.new()
	l.text = "build %s · %s" % [String(info.get("commit", "?")), String(info.get("builtAt", ""))]  # hardcode-ok
	l.add_theme_font_size_override("font_size", 12)
	l.add_theme_color_override("font_color", ThemeManager.get_color_value("text_dim"))
	l.anchor_left = 1.0
	l.anchor_top = 1.0
	l.anchor_right = 1.0
	l.anchor_bottom = 1.0
	l.offset_left = -260
	l.offset_top = -24
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	add_child(l)

func _on_play() -> void:
	SceneRouter.goto("level_select")

## Continue resumes the level stored in the save (MainMenuScene.ts passes
## save.currentLevel to GameScene). Falls back to level_01 for unknown keys.
func resolve_continue_key(save: Dictionary) -> String:
	var key := String(save.get("currentLevel", "level_01"))
	return key if LevelManager.has_level(key) else "level_01"

func _on_continue() -> void:
	LevelManager.set_current_level(resolve_continue_key(SaveManager.get_data()))
	SceneRouter.goto("game")

func _on_switch_user() -> void:
	ProfileManager.logout()
	SceneRouter.goto("login")
