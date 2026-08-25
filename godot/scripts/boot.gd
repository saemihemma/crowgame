extends Node2D
## Boot scene. Autoloads have already initialized by the time this runs; its job
## is to show something immediately and route to the right first screen.

func _ready() -> void:
	_build_placeholder()
	# Autoloads have initialized (data/save/profile). Route to the menu.
	# (Login flow is deferred; MainMenu -> Play starts the game.)
	await get_tree().create_timer(0.4).timeout
	# Tell the page that a child can actually play now.
	#
	# This is the denominator for the boot funnel: crow-errors.js reports
	# boot_start on script load, and without a matching boot_ready an empty errors
	# table cannot distinguish "nobody came" from "everyone's game failed to
	# load". Reported here rather than on engine start, because an engine that
	# started but never reached a scene is still a broken game for a player.
	_report_boot_ready()

	# Route to the active profile's menu, or the login screen -- through the
	# prologue on a first launch.
	if ProfileManager.get_active_user() != null:
		SceneRouter.goto("main_menu")
	elif _should_play_prologue():
		SceneRouter.goto("cinematic")
	else:
		SceneRouter.goto("login")

## The opening film plays once, before there is a profile to hang it on -- so
## "seen" is a device fact, not a per-child one (brand/CINEMATIC_DIRECTION.md
## 5.2). That is also the right answer for the second child on a family tablet:
## it is a first-*launch* event, not a first-*child* event.
##
## Clear `crow_prologue_seen` to watch it again; ONBOARDING_AGENT.md lists it
## with the other state-reset keys.
func _should_play_prologue() -> bool:
	if Persistence.has_item("crow_prologue_seen"):
		return false
	return SceneRouter.has_scene("cinematic")

func _report_boot_ready() -> void:
	if not OS.has_feature("web"):
		return
	# Carries whether this device already had a save, which is the signal that
	# would reveal browser storage eviction wiping a child's progress: a cohort
	# whose repeat launches always report no save is the eviction signature.
	var had_save := "true" if SaveManager.has_save() else "false"
	JavaScriptBridge.eval(
		"window.crowBootReady && window.crowBootReady({hadExistingSave:%s})" % had_save, true)

func _build_placeholder() -> void:
	# Sky is the project's default_clear_color (#87CEEB), matching src/main.ts.
	var label := Label.new()
	label.text = TextManager.t("menu.title")
	label.add_theme_font_size_override("font_size", 96)
	label.add_theme_color_override("font_color", Color.WHITE)
	label.add_theme_color_override("font_shadow_color", Color.BLACK)
	label.add_theme_constant_override("shadow_offset_x", 3)
	label.add_theme_constant_override("shadow_offset_y", 3)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.size = Vector2(960, 540)
	add_child(label)

	var subtitle := Label.new()
	subtitle.text = TextManager.t("boot.loading")
	subtitle.add_theme_font_size_override("font_size", 20)
	subtitle.add_theme_color_override("font_color", ThemeManager.get_color_value("text_dim"))
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	subtitle.position = Vector2(0, 340)
	subtitle.size = Vector2(960, 40)
	add_child(subtitle)
