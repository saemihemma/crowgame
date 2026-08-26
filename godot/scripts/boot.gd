extends Control
## The title screen: the first thing anyone sees, and the gesture that starts the
## game's audio.
##
## What this replaced: the project's flat clear colour with "HÖRMANN" in the
## default font and "Hleð..." under it, held for 0.4 seconds and then gone. It
## loaded nothing during that time — the autoloads finish before this scene runs —
## so the word "loading" was decoration, and the first impression of the whole
## game was a debug page.
##
## THE PROGRESS BAR MEASURES REAL WORK. It is not a timer dressed as a bar. The
## queue below is requested through ResourceLoader's threaded API and the bar
## reads `load_threaded_get_status`, so it moves when bytes land and stalls when
## they do not. The work is also worth doing: the level music and the world's
## parallax strips are the biggest things the game streams, and pulling them in
## here is why the first level does not hitch on its first bar of music. A bar
## with nothing behind it would be the same lie as the old "Hleð...".
##
## WHY THE PRESS EXISTS, AND WHY IT IS NOT SKIPPABLE. Browsers refuse to start
## audio until the page has had a real user gesture, so a title screen that
## auto-advances hands the player a silent menu and there is no second chance at
## a first gesture. The press IS the audio unlock: the music starts on it and
## keeps playing into the menu, because AudioManager is an autoload and nothing
## downstream re-issues play_music for the title track.
##
## One affordance, both device classes: Enter, any key, a click and a touch all
## do the same thing, and only the WORDING changes — TouchControls.supported()
## already knows which machine this is, and it is the same question that decides
## whether the on-screen pads exist.

## Everything worth having in memory before the first level starts. Keys, never
## paths — SpriteSheet and the audio manifest own where a thing lives
## (ARCHITECTURE rule 7), and a path here would rot the day art is re-exported.
const PRELOAD_PARALLAX_BANDS := ["far", "mid", "near"]

## The bar never finishes faster than this. Not padding for its own sake: on a
## warm cache the queue resolves in a single frame, the bar would jump 0 to 100
## between two paints, and a player would see a flash rather than a screen. This
## is the floor of a beat a person can register.
const MIN_VISIBLE_SECONDS := 0.9

const TITLE_MUSIC := "title_music"

var _bar: ProgressBar
var _hint: Label
var _prompt: Label
var _started_at := 0
var _queue: Array[String] = []
var _ready_to_start := false
var _leaving := false


func _ready() -> void:
	_started_at = Time.get_ticks_msec()
	_build()
	_queue = _begin_preload()
	set_process(true)


func _process(_delta: float) -> void:
	if _leaving:
		return
	var progress := _preload_progress()
	var elapsed := float(Time.get_ticks_msec() - _started_at) / 1000.0
	var paced: float = minf(progress, elapsed / MIN_VISIBLE_SECONDS)
	if is_instance_valid(_bar):
		_bar.value = paced * 100.0
	if not _ready_to_start and progress >= 1.0 and elapsed >= MIN_VISIBLE_SECONDS:
		_arrive()


## The queue is real, and this is what makes the bar honest: every entry is a
## threaded request whose status the bar reads.
func _begin_preload() -> Array[String]:
	var paths: Array[String] = []
	var world := ThemeManager.get_theme_id()
	for band in PRELOAD_PARALLAX_BANDS:
		var key := "parallax_%s_%s" % [world, band]
		var path := SpriteSheet.path_of(key)
		if path != "" and ResourceLoader.exists(path):
			paths.append(path)
	var music_file := String(
		DataManager.get_dict("AUDIO_MANIFEST").get("music", {}).get(TITLE_MUSIC, {}).get("file", ""))
	if music_file != "":
		var music_path := "res://%s" % music_file
		if ResourceLoader.exists(music_path):
			paths.append(music_path)
	for p in paths:
		ResourceLoader.load_threaded_request(p)
	return paths


## Collect anything still in flight before this scene dies.
##
## A threaded request that is never collected keeps a ResourceLoader worker
## holding it, and Godot waits on those workers at shutdown — so a Boot freed
## mid-load hangs the process instead of exiting. Headless that means a test run
## that prints its results and then never returns, which is exactly how this was
## found. The loaded resources are dropped immediately; the point is the collect,
## not the value.
func _exit_tree() -> void:
	for path in _queue:
		if ResourceLoader.load_threaded_get_status(path) != ResourceLoader.THREAD_LOAD_INVALID_RESOURCE:
			ResourceLoader.load_threaded_get(path)
	_queue.clear()


## Mean completion across the queue. An empty queue is complete, not stuck: a
## build with no parallax art for the active world must still reach the menu.
func _preload_progress() -> float:
	if _queue.is_empty():
		return 1.0
	var total := 0.0
	for path in _queue:
		var parts: Array = []
		var status := ResourceLoader.load_threaded_get_status(path, parts)
		match status:
			ResourceLoader.THREAD_LOAD_LOADED:
				total += 1.0
			ResourceLoader.THREAD_LOAD_IN_PROGRESS:
				total += float(parts[0]) if not parts.is_empty() else 0.0
			_:
				# Failed or invalid. Counted as done — a missing strip is a
				# degraded background, not a reason to hold a child on a bar.
				total += 1.0
	return total / float(_queue.size())


## Loading is finished; hand over to the player.
func _arrive() -> void:
	_ready_to_start = true
	# The bar and "getting the world ready" have said what they had to say. A
	# full bar next to a live prompt is two instructions at once, and this screen
	# is the first thing a five-year-old reads.
	if is_instance_valid(_bar):
		_bar.visible = false
	if is_instance_valid(_hint):
		_hint.visible = false
	if is_instance_valid(_prompt):
		_prompt.text = TextManager.t(
			"boot.tap_start" if TouchControls.supported() else "boot.press_start")
		_prompt.visible = true
		UiFx.elastic_entrance(_prompt)
		_pulse(_prompt)


## Anything at all, once the bar is full. `_input` rather than `_unhandled_input`:
## there is nothing else on this screen to consume a press, and a title screen
## that ignores the first key a player tries is worse than one that takes any.
func _input(event: InputEvent) -> void:
	if not _ready_to_start or _leaving:
		return
	# Typed explicitly: `event.pressed` off a base InputEvent has no static type,
	# so `:=` cannot infer bool and the whole script fails to parse. Nothing
	# headless mounts this scene, so the parse error only surfaced in a browser.
	var pressed: bool = (event is InputEventKey and event.pressed and not event.echo) \
		or (event is InputEventMouseButton and event.pressed) \
		or (event is InputEventScreenTouch and event.pressed) \
		or (event is InputEventJoypadButton and event.pressed)
	if pressed:
		get_viewport().set_input_as_handled()
		_start()


func _start() -> void:
	_leaving = true
	set_process(false)
	# The gesture the browser was waiting for has now happened, so this is the
	# earliest moment music can legally begin. It continues into the menu on its
	# own: AudioManager outlives the scene and nothing re-issues play_music for
	# this key, so the track is unbroken across the transition.
	AudioManager.play_music(TITLE_MUSIC)
	AudioManager.play_event("button")
	_report_boot_ready()
	if ProfileManager.get_active_user() != null:
		SceneRouter.goto("main_menu")
	else:
		SceneRouter.goto("login")


func _report_boot_ready() -> void:
	if not OS.has_feature("web"):
		return
	# Carries whether this device already had a save, which is the signal that
	# would reveal browser storage eviction wiping a child's progress: a cohort
	# whose repeat launches always report no save is the eviction signature.
	#
	# Moved from the old auto-advance to the press. It is the boot funnel's
	# denominator, and "the game is ready for a child" is now a screen a person
	# has actually acted on rather than a timer that elapsed.
	var had_save := "true" if SaveManager.has_save() else "false"
	JavaScriptBridge.eval(
		"window.crowBootReady && window.crowBootReady({hadExistingSave:%s})" % had_save, true)


func _pulse(node: Control) -> void:
	if UiFx.reduced_motion():
		return
	node.modulate.a = 1.0
	var tween := node.create_tween().set_loops()
	tween.tween_property(node, "modulate:a", 0.45, 0.8).set_trans(Tween.TRANS_SINE)
	tween.tween_property(node, "modulate:a", 1.0, 0.8).set_trans(Tween.TRANS_SINE)


# ─── Composition ──────────────────────────────────────────────────────────────

func _build() -> void:
	# `self`, not a Control added to a Node2D. That was the bug: Godot gives a
	# Control no layout rect when its parent is a Node2D, so PRESET_FULL_RECT
	# resolved against a zero-size parent, FitBox measured a room of -32px and
	# put the whole column in the top-left corner at a hair's width. The scene
	# root is a Control now and Boot extends it.
	var root: Control = self
	BrandTheme.apply(root)

	# Dressed like a LEVEL, not like a menu: the themed two-stop sky with the
	# world's parallax ranges standing on it, which is exactly what a child sees
	# when they start playing. ScreenBackdrop's drawn silhouettes are the
	# fallback for a world with no strips yet -- its own docstring says the
	# parallax art is what replaces it, and layering both put green ridges behind
	# teal ones and read as mush.
	if _add_ranges(root):
		_add_sky(root)
	else:
		root.add_child(ScreenBackdrop.new())
	_add_crow(root)

	var column := VBoxContainer.new()
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_theme_constant_override("separation", 18)
	# Fitted, not centred: a 16:9 display gives the viewport exactly 540 and this
	# column carries a 96px wordmark. See FitBox.
	root.add_child(FitBox.around(column))

	var wordmark := Label.new()
	wordmark.text = TextManager.t("menu.title")
	wordmark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	wordmark.add_theme_font_size_override("font_size", 96)
	wordmark.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	wordmark.add_theme_color_override("font_shadow_color", ThemeManager.get_color_value("ink"))
	wordmark.add_theme_constant_override("shadow_offset_x", 4)
	wordmark.add_theme_constant_override("shadow_offset_y", 5)
	column.add_child(wordmark)

	var rule := ColorRect.new()
	rule.color = ThemeManager.get_color_value("accent")
	rule.custom_minimum_size = Vector2(220, 4)
	rule.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	column.add_child(rule)

	var hint := Label.new()
	hint.text = TextManager.t("boot.loading_hint")
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.add_theme_font_size_override("font_size", 20)
	hint.add_theme_color_override("font_color", ThemeManager.get_color_value("owl"))
	column.add_child(hint)
	_hint = hint

	_bar = ProgressBar.new()
	_bar.custom_minimum_size = Vector2(360, 16)
	_bar.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_bar.show_percentage = false
	_bar.min_value = 0.0
	_bar.max_value = 100.0
	_bar.value = 0.0
	_bar.add_theme_stylebox_override("background", _bar_face(
		Color(ThemeManager.get_color_value("ink"), 0.55)))
	_bar.add_theme_stylebox_override("fill", _bar_face(
		ThemeManager.get_color_value("coin")))
	column.add_child(_bar)

	# Built hidden and filled in by _arrive(), so the screen never asks for a
	# press it will not yet answer.
	_prompt = Label.new()
	_prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_prompt.add_theme_font_size_override("font_size", 26)
	_prompt.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	_prompt.add_theme_color_override("font_shadow_color", ThemeManager.get_color_value("ink"))
	_prompt.add_theme_constant_override("shadow_offset_x", 2)
	_prompt.add_theme_constant_override("shadow_offset_y", 3)
	_prompt.visible = false
	column.add_child(_prompt)


## The active world's ranges, standing on the lower third. Static here rather
## than a ParallaxBackground: nothing scrolls on a title screen, and a
## CanvasLayer would sit outside the Control tree this screen is built from.
func _add_ranges(parent: Control) -> bool:
	var world := ThemeManager.get_theme_id()
	var found := false
	for band in PRELOAD_PARALLAX_BANDS:
		var texture := SpriteSheet.texture("parallax_%s_%s" % [world, band])
		if texture == null:
			continue
		var art := TextureRect.new()
		art.texture = texture
		art.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		art.mouse_filter = Control.MOUSE_FILTER_IGNORE
		art.anchor_left = 0.0
		art.anchor_right = 1.0
		art.anchor_top = 0.30
		art.anchor_bottom = 1.0
		art.z_index = -90
		parent.add_child(art)
		# Only the nearest band reads sharply; the two behind it sit back into
		# the sky, which is what gives the ridges depth on a still screen.
		art.modulate.a = 1.0 if band == "near" else 0.8
		found = true
	return found


## The themed two-stop sky, from the same palette roles game.gd::_paint_sky reads,
## so the title screen and the first level are lit the same way.
func _add_sky(parent: Control) -> void:
	var gradient := Gradient.new()
	gradient.set_color(0, ThemeManager.get_color_value("sky_top"))
	gradient.set_color(1, ThemeManager.get_color_value("sky_bottom"))
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill_from = Vector2(0, 0)
	texture.fill_to = Vector2(0, 1)
	texture.width = 8          # vertical gradient, so width can be tiny
	texture.height = 256

	var sky := TextureRect.new()
	sky.texture = texture
	sky.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	sky.stretch_mode = TextureRect.STRETCH_SCALE
	sky.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	sky.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sky.z_index = -100
	parent.add_child(sky)


## The crow, standing on the range line, facing the wordmark. The character is
## the most finished art in the game and the title screen was the one place it
## never appeared.
func _add_crow(parent: Control) -> void:
	var texture := SpriteSheet.texture("crow_idle")
	if texture == null:
		return
	var crow := TextureRect.new()
	crow.texture = texture
	crow.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT
	crow.custom_minimum_size = Vector2(128, 128)
	crow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	crow.anchor_left = 1.0
	crow.anchor_right = 1.0
	crow.anchor_top = 1.0
	crow.anchor_bottom = 1.0
	crow.offset_left = -232.0
	crow.offset_top = -196.0
	crow.offset_right = -104.0
	crow.offset_bottom = -68.0
	crow.z_index = -80
	parent.add_child(crow)


func _bar_face(fill: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.set_corner_radius_all(8)
	box.set_border_width_all(2)
	box.border_color = Color(ThemeManager.get_color_value("paper"), 0.65)
	return box
