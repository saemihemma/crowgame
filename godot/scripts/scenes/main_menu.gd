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
