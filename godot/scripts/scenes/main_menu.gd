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
##    else is quieter. The grown-up row - the parent report - is a ghost, which
##    is the same judgement main already made in prose: it is a setting, not the
##    child's path through the menu.
## 3. Continue says *where* you are and *how many owls you have brought home*.
##    Progress is the reason anyone comes back, and it was invisible.
##
## CAPITALS MEAN ONE THING HERE, and until a playtester asked they meant two.
## The column read SPILA, then a place name, then MITT FERÐALAG, then three rows
## in sentence case -- "why is MITT FERÐALAG caps and others are not?", which had
## no answer, because it was not a decision, it was two strings written on
## different days.
##
## The rule, now that there is one: a screen's TITLE shouts (menu.title,
## level_select.title, pause.title) and so does the ONE primary action on it
## (menu.play). Nothing else does. Shouting is how this menu says "this is the
## button", so a second shouting row is the design saying it twice.

const PARENT_REPORT := preload("res://scenes/ParentReport.tscn")

const TITLE_SIZE := 92
const SUBTITLE_SIZE := 26
const COLUMN_SEPARATION := 14

func _ready() -> void:
	BrandTheme.apply(self)
	add_child(ScreenBackdrop.new())
	_add_hero()

	# Fitted, not centred: the wordmark plus up to five Gate-B3 rows is taller
	# than the 540 a 16:9 display leaves, and this column grows by a row when a
	# save exists, when a profile exists and when the build is on the web.
	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", COLUMN_SEPARATION)
	add_child(FitBox.around(col))

	_build_wordmark(col)

	# ONE WAY TO START PLAYING.
	#
	# There used to be two, and a playtester asked the obvious question about
	# them: PLAY opened the world grid, and under it a second button read
	# "Prísmahellir · 10 uglur heima" and went straight into that world. Two
	# buttons, both of which start the game, one of them naming a place the child
	# has to already recognise -- "why can I choose the level ... why isn't it
	# just play?"
	#
	# So Play IS Continue: it resumes wherever this child got to, and for a child
	# with no save it starts the first world. Where they are going is said
	# UNDERNEATH it, as a line rather than as a second button, because it is
	# information about the button and never was a separate choice.
	var first := _add(col, TextManager.t("menu.play"), BrandButton.Role.PRIMARY, _on_play)
	if SaveManager.has_save():
		_add_caption(col, _continue_label())
		# Going somewhere OTHER than where you left off. A real choice, and the
		# only one of the two that ever was -- quieter than Play, and absent for a
		# child who has only ever seen one world.
		_add(col, TextManager.t("menu.choose_world"), BrandButton.Role.SECONDARY, _on_choose_world)
	# How much of the game is finished, and which bit is missing. Below Continue
	# because it is a place to LOOK rather than a place to play, and only once
	# there is a save -- an empty progress screen reading 0% is a worse first
	# impression than no row at all.
	if SaveManager.has_save():
		_add(col, TextManager.t("menu.progress"), BrandButton.Role.SECONDARY, _on_progress)
	if ProfileManager.get_active_user() != null:
		_add(col, TextManager.t("menu.switch_user"), BrandButton.Role.GHOST, _on_switch_user)
	# NO CLOUD-SAVE ROW, and nothing replaced it.
	#
	# There used to be one, reading "Vistun í netinu", opening a panel that
	# emailed a sign-in link. The owner's verdict was blunt and correct: cloud
	# save is not a feature to switch on, it is what a save IS -- "I wanna log
	# into my progress at work tomorrow". A child should not have to find a
	# settings row to have their own progress follow them.
	#
	# So signing in IS the login screen now (see login.gd), and from the moment a
	# name is claimed there, CloudSync syncs on its own. There is no switch left
	# to offer, which is the whole of the improvement.
	if ProfileManager.has_profiles():
		_add(col, TextManager.t("report_open"), BrandButton.Role.GHOST, _on_parent_report)
	first.grab_focus.call_deferred()
	# Language selector, top-right, out of the way of the centred column.
	add_child(LanguageToggle.build(_on_locale_changed))
	_add_build_stamp()

	# Trophy shelf: one badge per domain the child has actually met, grown
	# from the highest step ever reached. Badges only ever grow.
	_build_trophy_shelf()

	# Session-end recap (peak-end rule): arriving here from play with
	# something to celebrate shows one warm recap that ends on the best
	# moment. Consuming resets the counters, so it shows exactly once.
	var recap: Dictionary = SessionStats.consume()
	if not recap.is_empty():
		_show_recap(recap)

## Code-drawn badge row along the bottom (TrophyBadge). Tier thresholds come
## from the shared math_tuning.json (`trophies.tierSteps`).
func _build_trophy_shelf() -> void:
	var tier_steps: Array = (DataManager.get_dict("MATH_TUNING").get("trophies", {}) as Dictionary).get("tierSteps", [])
	if tier_steps.is_empty():
		return
	var earned: Array = []
	for domain in MathDomains.ALL:
		if LearnerStateManager.get_total_attempts(String(domain)) <= 0:
			continue
		var highest: int = LearnerStateManager.get_highest_step(String(domain))
		var tier := -1
		for i in tier_steps.size():
			if highest >= int(tier_steps[i]):
				tier = i
		if tier >= 0:
			earned.append({"domain": domain, "tier": tier})
	if earned.is_empty():
		return

	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 28)
	row.anchor_left = 0.0
	row.anchor_right = 1.0
	row.anchor_top = 1.0
	row.anchor_bottom = 1.0
	row.offset_top = -84
	row.offset_bottom = -12
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(row)
	for badge in earned:
		var cell := VBoxContainer.new()
		cell.alignment = BoxContainer.ALIGNMENT_CENTER
		cell.mouse_filter = Control.MOUSE_FILTER_IGNORE
		cell.add_child(TrophyBadge.new(int(badge["tier"])))
		var label := Label.new()
		label.text = TextManager.t("domain." + String(badge["domain"]))
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.add_theme_font_size_override("font_size", 13)
		label.add_theme_color_override("font_color", ThemeManager.get_color_value("text_dim"))
		cell.add_child(label)
		row.add_child(cell)

## One warm recap over the menu: counts first, the session's single best
## moment last (comeback beats golden beats step-up), and an "Onward!"
## button. Only positive stats are ever rendered.
func _show_recap(recap: Dictionary) -> void:
	var dim := ColorRect.new()
	dim.color = ThemeManager.get_color_value("scrim")
	dim.anchor_right = 1.0
	dim.anchor_bottom = 1.0
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(dim)

	var center := CenterContainer.new()
	center.anchor_right = 1.0
	center.anchor_bottom = 1.0
	dim.add_child(center)

	var panel := PanelContainer.new()
	center.add_child(panel)
	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 14)
	panel.add_child(col)

	var title := Label.new()
	title.text = TextManager.t("recap.title")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 40)
	title.add_theme_color_override("font_color", ThemeManager.get_color_value("accent"))
	col.add_child(title)

	var lines: Array[String] = []
	if int(recap["owlsSaved"]) > 0:
		lines.append(TextManager.t("recap.owls", [recap["owlsSaved"]]))
	if int(recap["problemsSolved"]) > 0:
		lines.append(TextManager.t("recap.problems", [recap["problemsSolved"]]))
	if int(recap["stepUps"]) > 0:
		lines.append(TextManager.t("recap.stepups", [recap["stepUps"]]))
	# Peak-end: the best moment is the last thing on screen before the
	# button. Comeback is the strongest story we can tell about a miss.
	if int(recap["comebacks"]) > 0:
		lines.append(TextManager.t("recap.best_comeback"))
	elif int(recap["goldenWins"]) > 0:
		lines.append(TextManager.t("recap.best_golden"))
	for line in lines:
		var l := Label.new()
		l.text = line
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.add_theme_font_size_override("font_size", 22)
		col.add_child(l)

	var btn := BrandButton.make(TextManager.t("recap.continue"), BrandButton.Role.PRIMARY, func():
		dim.queue_free()
		if _first_button != null and is_instance_valid(_first_button):
			_first_button.grab_focus()
	)
	btn.custom_minimum_size.x = 260
	btn.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	col.add_child(btn)
	btn.grab_focus()

	AudioManager.play_event("milestone")
	UiFx.elastic_entrance.call_deferred(panel)

func _on_parent_report() -> void:
	add_child(PARENT_REPORT.instantiate())

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

## The first action on the screen. The recap panel hands focus back to it when
## it closes, so it is remembered rather than re-derived from child order - the
## wordmark now contributes three children before any button exists.
var _first_button: BrandButton = null

## A line under a button, saying what pressing it does. Not a control: it takes
## no input and no focus, so a thumb sweeping the column cannot land on it.
func _add_caption(parent: Node, text: String) -> Label:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_font_size_override("font_size", CAPTION_SIZE)
	l.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	l.add_theme_color_override("font_shadow_color", ThemeManager.get_color_value("ink"))
	l.add_theme_constant_override("shadow_offset_x", 2)
	l.add_theme_constant_override("shadow_offset_y", 2)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(l)
	return l

const CAPTION_SIZE := 20

func _add(parent: Node, text: String, role: int, cb: Callable) -> BrandButton:
	var b := BrandButton.make(text, role, cb)
	b.custom_minimum_size.x = 340
	b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	parent.add_child(b)
	if _first_button == null:
		_first_button = b
	return b

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
	col.add_child(subtitle)

## Hörmann himself, perched on the ridge line. He was not on his own title
## screen - the game was named after a character the first screen never showed.
const HERO_SPRITE_KEY := "crow_idle"
const HERO_SCALE := 2.0
const HERO_BOB_PIXELS := 5.0
const HERO_BOB_SECONDS := 2.4

func _add_hero() -> void:
	if not SpriteSheet.has_art(HERO_SPRITE_KEY):
		return
	var hero := TextureRect.new()
	hero.texture = SpriteSheet.texture(HERO_SPRITE_KEY)
	hero.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	hero.custom_minimum_size = Vector2(64.0 * HERO_SCALE, 64.0 * HERO_SCALE)
	hero.mouse_filter = Control.MOUSE_FILTER_IGNORE
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

## "Emberwood Run · 4 owls home" rather than a bare "CONTINUE". The one number a
## returning player wants is how many owls they have.
func _continue_label() -> String:
	var save := SaveManager.get_data()
	# tp() for the owl count: one owl is "1 ugla heima", not "1 uglur heima".
	return TextManager.tp("menu.continue_detail", {
		"world": _world_name(resolve_continue_key(save)),
		"owls": int(save.get("owlsSaved", 0)),
	}, "owls")

func _world_name(key: String) -> String:
	var name_key := "level.%s.name" % key
	if TextManager.has(name_key):
		return TextManager.t(name_key)
	var entry: Variant = LevelManager.get_level(key)
	return String(entry.get("name", key)) if entry != null else key

## Play resumes. For a child with no save `resolve_continue_key` returns the
## first world, so the same button is "start" and "carry on" without the menu
## having to say which it is -- the child presses the big yellow one either way.
func _on_play() -> void:
	LevelManager.set_current_level(resolve_continue_key(SaveManager.get_data()))
	SceneRouter.goto("game")

func _on_choose_world() -> void:
	SceneRouter.goto("level_select")

## The level stored in the save (MainMenuScene.ts passes save.currentLevel to
## GameScene). Falls back to level_01 for unknown keys and for no save at all.
func resolve_continue_key(save: Dictionary) -> String:
	var key := String(save.get("currentLevel", "level_01"))
	return key if LevelManager.has_level(key) else "level_01"


func _on_progress() -> void:
	SceneRouter.goto("progress")

func _on_switch_user() -> void:
	ProfileManager.logout()
	SceneRouter.goto("login")
