extends Node2D
## Boot scene — Godot port of src/scenes/BootScene.ts.
##
## Slice 1: proves the pixel-perfect 960x540 viewport renders and the project
## boots. Later slices expand this to preload data, initialize autoloads, and
## route to Login/MainMenu based on the active profile (BootScene.create()).

func _ready() -> void:
	_build_placeholder()
	# Autoloads have initialized (data/save/profile). Route to the menu.
	# (Login flow is deferred; MainMenu -> Play starts the game.)
	await get_tree().create_timer(0.4).timeout
	# Route to the active profile's menu, or the login screen.
	if ProfileManager.get_active_user() != null:
		get_tree().change_scene_to_file("res://scenes/MainMenu.tscn")
	else:
		get_tree().change_scene_to_file("res://scenes/Login.tscn")

func _build_placeholder() -> void:
	# Sky is the project's default_clear_color (#87CEEB), matching src/main.ts.
	var label := Label.new()
	label.text = "CROW"
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
