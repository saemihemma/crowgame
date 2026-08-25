extends Control
## Cinematic — the data-driven stills player.
##
## Painted plates, one camera move per shot, crossfades between them, layers
## drifting at different rates. Every shot, duration, caption and cue comes from
## `godot/data/cinematics/<id>.json`; nothing about the prologue is written here,
## so a second cinematic is a JSON file, a DataManager.PATHS entry, its caption
## keys in both bundles and its plates. No new code.
##
## Direction and the reason behind every constant: brand/CINEMATIC_DIRECTION.md.
## Story: brand/STORY_BIBLE.md. Shape: authoring/cinematics/schemas/.
## Enforcement: `node tools/validate_cinematics.mjs`, in `npm run validate`.
##
## Three things worth knowing before changing anything:
##
## 1. THE CAMERA IS A TRANSFORM, NOT A SHADER. A shot names a source rect on the
##    plate; this maps it onto the viewport with a scale and an offset and tweens
##    between the two rects. That costs nothing per frame, and it is why the
##    validator can prove the frame never leaves the plate (it is linear in t).
##
## 2. AT MOST TWO SHOTS ARE RESIDENT. A plate is ~10 MB decoded and there are 18
##    of them; all resident would be a low-end tablet browser's whole budget. The
##    next shot's plates load during the current hold — where a hitch is
##    invisible — and everything older is freed.
##
## 3. IT ALWAYS ROUTES ON. Missing data, an unreadable plate, an empty shot list:
##    every failure path ends at `login`. A cinematic that can stop a child from
##    reaching the game is a defect, not a cinematic.

## The one duration this format adds to BRAND_SYSTEM.md §9.1.
const CINE_FADE := 0.9
## §9.1's existing ladder, for the caption.
const ENTER := 0.26
const EXIT := 0.18
const CAPTION_DELAY_DEFAULT := 0.4
## A caption leaves this far before the hold ends, so it never crosses a fade.
const CAPTION_TAIL := 0.4
## §3.3 — layer drift is a slow sine, phase-offset per layer so no two breathe
## together.
const DRIFT_PERIOD := 5.2
## §3.4 — the caption band, on its own scrim, at the bottom of the frame.
const CAPTION_SIZE := 28
const CAPTION_BAND_H := 96.0
const CAPTION_PAD := 40.0
## Gate B3 lives in BrandButton; these are only where it sits and how wide it
## is. Fixed rather than derived from the text, because Icelandic is longer than
## English and `tools/validate_i18n.mjs` measures `cine.skip` against it (§4.4).
const SKIP_MARGIN := 20.0
const SKIP_WIDTH := 200.0
const SKIP_ALPHA := 0.72

## Which cinematic to play, and where to go when it is over. Set before the
## scene is entered if this is ever used for anything but the prologue.
static var cinematic_id := "prologue"
static var next_scene := "login"

var _shots: Array = []
var _index := -1
var _elapsed := 0.0
var _fading := false
var _done := false
var _sfx_fired := false

## JSON `null` arrives as GDScript `null`, and `String(null)` is not a valid
## constructor call -- it throws. The prologue's third shot is deliberately
## wordless (`"caption": null`), so without this the film died on the claw.
static func _opt(value: Variant) -> String:
	return "" if value == null else String(value)


var _stage_current: Control
var _stage_next: Control
var _caption_scrim: ColorRect
var _caption: Label
var _skip: BrandButton


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	BrandTheme.apply(self)

	# The sky the film hands over to. `login.gd` builds the same one from the
	# same theme, so the last fade dissolves into the actual background of the
	# actual UI rather than into black (§5.1). This is why there is no cut
	# between the story and the name field.
	add_child(ScreenBackdrop.new())

	_shots = _load_shots()
	if _shots.is_empty():
		# Nothing to play is not an error worth showing a child.
		_leave()
		return

	# Marked seen on START, not on finish: a child who skips at 0.4s has still
	# met it, and re-showing it next launch is how a cinematic becomes a thing
	# to dread (§5.2).
	Persistence.set_item("crow_prologue_seen", "1")

	_build_stages()
	_build_caption()
	_build_skip()
	_begin_shot(0)


func _load_shots() -> Array:
	var data: Dictionary = DataManager.get_dict("CINEMATIC_" + cinematic_id.to_upper())
	var shots: Variant = data.get("shots", null)
	if not (shots is Array):
		push_warning("[Cinematic] no shots for '%s'; routing on" % cinematic_id)
		return []
	return shots


## Two stages is all a crossfade needs, and capping them at two is what caps
## resident plates at two shots (§4.4).
func _build_stages() -> void:
	_stage_current = _new_stage()
	_stage_next = _new_stage()
	_stage_next.modulate.a = 0.0


func _new_stage() -> Control:
	var stage := Control.new()
	stage.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# The plates are larger than the frame by design (the camera bleed), so the
	# stage clips rather than letting a layer paint over the caption band.
	stage.clip_contents = true
	add_child(stage)
	return stage


func _build_caption() -> void:
	# §8.7, the scrim rule, and §8.6b: a caption carries its own contrast rather
	# than borrowing it from whichever plate happens to be behind it.
	_caption_scrim = ColorRect.new()
	_caption_scrim.color = Color(ThemeManager.get_color_value("ink"), 0.62)
	_caption_scrim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_caption_scrim.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	_caption_scrim.anchor_top = 1.0
	_caption_scrim.offset_top = -CAPTION_BAND_H
	_caption_scrim.offset_bottom = 0.0
	_caption_scrim.modulate.a = 0.0
	add_child(_caption_scrim)

	_caption = Label.new()
	_caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_caption.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	# Never laid out to fit the English string: Icelandic compounds are long and
	# §4.4 budgets every label slot at 1.4x. The band is the full width less
	# padding, and `tools/validate_i18n.mjs` measures every caption against it.
	_caption.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	_caption.anchor_top = 1.0
	_caption.offset_top = -CAPTION_BAND_H
	_caption.offset_bottom = 0.0
	_caption.offset_left = CAPTION_PAD
	_caption.offset_right = -CAPTION_PAD
	_caption.add_theme_font_size_override("font_size", CAPTION_SIZE)
	_caption.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	_caption.add_theme_color_override("font_shadow_color", ThemeManager.get_color_value("ink"))
	_caption.add_theme_constant_override("shadow_offset_x", 2)
	_caption.add_theme_constant_override("shadow_offset_y", 2)
	_caption.modulate.a = 0.0
	add_child(_caption)


## The skip control. Visible from the first frame (§1 rule 3), focusable so a
## keyboard or gamepad reaches it (§12), and its icon is DRAWN rather than typed:
## `tools/validate_i18n.mjs` carries the scar that made that a rule — the login
## PIN dots were U+25CF, which Godot's built-in font does not have, and they
## shipped as boxes printing their own codepoints.
func _build_skip() -> void:
	_skip = BrandButton.make(TextManager.t("cine.skip"), BrandButton.Role.GHOST, _on_skip)
	# Top-right, which is this app's utility corner -- it is where `login.gd`
	# puts the language chips. Built here first at bottom-right and it landed in
	# the lower third of the frame, next to the caption, as the brightest thing
	# on screen: a control competing with the picture it is offering to skip.
	_skip.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_skip.offset_right = -SKIP_MARGIN
	_skip.offset_left = _skip.offset_right - SKIP_WIDTH
	_skip.offset_top = SKIP_MARGIN
	_skip.offset_bottom = _skip.offset_top + BrandButton.MIN_HEIGHT
	# Legible, not loud. It has to be findable by a parent from the first frame
	# and must never be the first thing a child looks at.
	_skip.modulate.a = SKIP_ALPHA
	add_child(_skip)
	UiFx.attach_focus_highlight(_skip)
	_skip.grab_focus()

	var chevron := Polygon2D.new()
	chevron.color = ThemeManager.get_color_value("paper")
	chevron.polygon = PackedVector2Array([
		Vector2(0, -9), Vector2(9, 0), Vector2(0, 9),
		Vector2(4, 9), Vector2(13, 0), Vector2(4, -9),
	])
	chevron.position = Vector2(18.0, BrandButton.MIN_HEIGHT * 0.5)
	_skip.add_child(chevron)


# ── playback ────────────────────────────────────────────────────────────────

func _begin_shot(index: int) -> void:
	_index = index
	_elapsed = 0.0
	_fading = false
	_sfx_fired = false

	var shot: Dictionary = _shots[index]
	_fill_stage(_stage_current, shot)
	_stage_current.modulate.a = 1.0
	_stage_next.modulate.a = 0.0

	var music := _opt(shot.get("music"))
	if music != "":
		AudioManager.play_music(music, CINE_FADE * 1000.0)

	_caption.text = ""
	_caption.modulate.a = 0.0
	_caption_scrim.modulate.a = 0.0
	var caption_key := _opt(shot.get("caption"))
	if caption_key != "":
		_caption.text = TextManager.t(caption_key)

	# The next shot's plates load during this hold, never during a fade — a
	# hitch on a held frame is invisible; a hitch mid-crossfade is the only
	# thing on screen.
	if index + 1 < _shots.size():
		_fill_stage.call_deferred(_stage_next, _shots[index + 1])
	else:
		_clear_stage(_stage_next)


func _process(delta: float) -> void:
	if _done or _shots.is_empty():
		return
	_elapsed += delta

	var shot: Dictionary = _shots[_index]
	var hold := float(shot.get("hold", 5.0))
	var fade := float(shot.get("transition", CINE_FADE))

	_apply_camera(shot, _stage_current, clampf(_elapsed / maxf(hold, 0.001), 0.0, 1.0))
	# The incoming stage is visible for the whole crossfade, so it has to be
	# framed at the start of its own move rather than sitting at the origin.
	if _index + 1 < _shots.size():
		_apply_camera(_shots[_index + 1], _stage_next, 0.0)
	_tick_caption(shot, hold)
	_tick_sfx(shot)

	if not _fading and _elapsed >= hold:
		_start_fade(fade)
	elif _fading and _elapsed >= hold + fade:
		_next_shot()


## The camera. A source rect on the plate maps onto the viewport by a scale and
## an offset; `t` walks from `move.from` to `move.to` across the hold.
##
## `cover`, not `contain`: `project.godot` stretches with aspect "expand", so on
## a wide device the viewport is wider than 960 and a contained frame would show
## the clear colour down the sides.
func _apply_camera(shot: Dictionary, stage: Control, t: float) -> void:
	if UiFx.reduced_motion():
		# §12: moves off, durations unchanged. Held on `to`, which is where each
		# shot resolves — the pull-back in shot 4 still reads as the wide view.
		t = 1.0

	var move: Dictionary = shot.get("move", {})
	var from: Array = move.get("from", [])
	var to: Array = move.get("to", [])
	if from.size() != 4 or to.size() != 4:
		return

	var vp := get_viewport_rect().size
	var w := lerpf(float(from[2]), float(to[2]), t)
	var h := lerpf(float(from[3]), float(to[3]), t)
	var scale := maxf(vp.x / maxf(w, 1.0), vp.y / maxf(h, 1.0))
	var now := float(Time.get_ticks_msec()) / 1000.0

	for i in stage.get_child_count():
		var layer := stage.get_child(i) as TextureRect
		if layer == null:
			continue
		var parallax := float(layer.get_meta("parallax", 1.0))
		var drift: Vector2 = layer.get_meta("drift", Vector2.ZERO)

		# Parallax applies to the translation only. Scale stays the frame's, or
		# the layers would drift apart in size instead of in depth.
		var x := float(from[0]) + (float(to[0]) - float(from[0])) * t * parallax
		var y := float(from[1]) + (float(to[1]) - float(from[1])) * t * parallax
		if not UiFx.reduced_motion():
			var phase := float(i) * 1.7
			x += drift.x * sin(now * TAU / DRIFT_PERIOD + phase)
			y += drift.y * sin(now * TAU / DRIFT_PERIOD + phase)

		layer.scale = Vector2(scale, scale)
		layer.position = vp * 0.5 - (Vector2(x, y) + Vector2(w, h) * 0.5) * scale


func _tick_caption(shot: Dictionary, hold: float) -> void:
	if _caption.text == "":
		return
	var delay := float(shot.get("captionDelay", CAPTION_DELAY_DEFAULT))
	var out_at := hold - CAPTION_TAIL
	var alpha := 0.0
	if _elapsed >= delay and _elapsed < out_at:
		alpha = clampf((_elapsed - delay) / ENTER, 0.0, 1.0)
	elif _elapsed >= out_at:
		alpha = clampf(1.0 - (_elapsed - out_at) / EXIT, 0.0, 1.0)
	_caption.modulate.a = alpha
	_caption_scrim.modulate.a = alpha


## Tracked on the scene, never written back into the shot: the shot dictionaries
## are DataManager's cached registry, and a cinematic that only fires its cues
## the first time it is watched is a cinematic nobody can review.
func _tick_sfx(shot: Dictionary) -> void:
	var event := _opt(shot.get("sfx"))
	if event == "" or _sfx_fired:
		return
	if _elapsed >= float(shot.get("sfxAt", 0.0)):
		_sfx_fired = true
		AudioManager.play_event(event)


func _start_fade(fade: float) -> void:
	_fading = true
	var tw := create_tween().set_parallel(true)
	tw.tween_property(_stage_current, "modulate:a", 0.0, fade)
	if _index + 1 < _shots.size():
		tw.tween_property(_stage_next, "modulate:a", 1.0, fade)
	_caption.modulate.a = 0.0
	_caption_scrim.modulate.a = 0.0


func _next_shot() -> void:
	if _index + 1 >= _shots.size():
		_leave()
		return
	# Swap the stages rather than rebuilding: the plates for the next shot are
	# already on `_stage_next`, and the ones being dropped are freed with it.
	var spent := _stage_current
	_stage_current = _stage_next
	_stage_next = spent
	move_child(_stage_current, _stage_next.get_index())
	_begin_shot(_index + 1)


# ── getting out ─────────────────────────────────────────────────────────────

## Any touch, click, key or gamepad button ADVANCES rather than skips (§5.3): a
## child pressing impatiently is served their way to the game in a couple of
## seconds instead of being ignored, and never has to find a button.
## `_unhandled_input`, deliberately: `_input` runs before the GUI, so a click on
## the skip control would advance the film instead of pressing the button, and
## `ui_accept` on the focused button would do both. Letting the Control layer
## have the event first means no special case here for either.
func _unhandled_input(event: InputEvent) -> void:
	if _done:
		return
	# Explicitly typed: GDScript cannot infer `bool` through the `is`/`and` chain
	# and `:=` here is a parse error, which loads as a null script and shows a
	# child a blank screen where the film should be.
	var pressed: bool = (
		(event is InputEventMouseButton and event.pressed)
		or (event is InputEventScreenTouch and event.pressed)
		or (event is InputEventKey and event.pressed and not event.echo)
		or (event is InputEventJoypadButton and event.pressed)
	)
	if not pressed:
		return
	if _fading:
		_next_shot()
	else:
		_start_fade(float((_shots[_index] as Dictionary).get("transition", CINE_FADE)))
		_elapsed = float((_shots[_index] as Dictionary).get("hold", 5.0))


func _on_skip() -> void:
	_leave()


## Skipping and finishing land in the same place, so there is nothing to lose by
## skipping and nothing to regret.
func _leave() -> void:
	if _done:
		return
	_done = true
	set_process(false)
	SceneRouter.goto(next_scene)


func _fill_stage(stage: Control, shot: Dictionary) -> void:
	if not is_instance_valid(stage):
		return
	_clear_stage(stage)
	var layers: Variant = shot.get("layers", [])
	if not (layers is Array):
		return
	for entry in layers:
		var layer: Dictionary = entry
		var path := "res://" + _opt(layer.get("src"))
		var tex: Texture2D = load(path) as Texture2D
		if tex == null:
			# One missing plate is a thinner shot, never a stopped film.
			push_warning("[Cinematic] plate missing: %s" % path)
			continue
		var rect := TextureRect.new()
		rect.texture = tex
		rect.stretch_mode = TextureRect.STRETCH_KEEP
		# The project draws canvas textures Nearest, which is right for every
		# sprite and wrong here: a painted plate at 1.07x gets some rows doubled
		# and some not, and the seam crawls as the camera moves. Plates are
		# exempt from the pixel law (CINEMATIC_DIRECTION.md 4.2) and this is the
		# other half of that exemption.
		rect.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		rect.size = tex.get_size()
		rect.set_meta("parallax", float(layer.get("parallax", 1.0)))
		var drift: Array = layer.get("drift", [0.0, 0.0])
		rect.set_meta("drift", Vector2(
			float(drift[0]) if drift.size() > 0 else 0.0,
			float(drift[1]) if drift.size() > 1 else 0.0))
		stage.add_child(rect)


func _clear_stage(stage: Control) -> void:
	if not is_instance_valid(stage):
		return
	for child in stage.get_children():
		stage.remove_child(child)
		child.queue_free()
