extends Control

const CLOUD_PANEL := preload("res://scenes/CloudPanel.tscn")
const PARENT_REPORT := preload("res://scenes/ParentReport.tscn")
## MainMenu — Godot port of MainMenuScene. Title + Play (and Continue if a save
## exists). Keyboard/touch friendly. Login flow is deferred; Play starts the game.

func _ready() -> void:
	var center := CenterContainer.new()
	center.anchor_right = 1.0
	center.anchor_bottom = 1.0
	add_child(center)
	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 24)
	center.add_child(col)

	var title := Label.new()
	title.text = TextManager.t("menu.title")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 96)
	title.add_theme_color_override("font_color", Color.WHITE)
	col.add_child(title)

	_add_button(col, TextManager.t("menu.play"), _on_play)
	if SaveManager.has_save():
		_add_button(col, TextManager.t("menu.continue"), _on_continue)
	if ProfileManager.get_active_user() != null:
		_add_button(col, TextManager.t("menu.switch_user"), _on_switch_user)
	# Cloud save is a grown-up's setting, so it lives behind its own panel rather
	# than in the child's path through the menu. Web-only: there is no cookie jar
	# or same-origin proxy on a desktop build.
	if OS.has_feature("web"):
		_add_button(col, TextManager.t("cloud_title"), _on_cloud)
	if ProfileManager.has_profiles():
		_add_button(col, TextManager.t("report_open"), _on_parent_report)
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

	var btn := Button.new()
	btn.text = TextManager.t("recap.continue")
	btn.custom_minimum_size = Vector2(220, 56)
	btn.add_theme_font_size_override("font_size", 26)
	btn.pressed.connect(func():
		dim.queue_free()
		if _first_button != null and is_instance_valid(_first_button):
			_first_button.grab_focus()
	)
	UiFx.attach_focus_highlight(btn)
	col.add_child(btn)
	btn.grab_focus()

	AudioManager.play_event("milestone")
	UiFx.elastic_entrance.call_deferred(panel)

func _on_cloud() -> void:
	add_child(CLOUD_PANEL.instantiate())

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

var _first_button: Button = null

func _add_button(parent: Node, text: String, cb: Callable) -> void:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(280, 72)
	b.add_theme_font_size_override("font_size", 32)
	b.pressed.connect(cb)
	UiFx.attach_focus_highlight(b)
	parent.add_child(b)
	if parent.get_child_count() == 2:  # focus the first button (after title)
		b.grab_focus()
		_first_button = b

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
