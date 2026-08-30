extends Control
## Login — Godot port of LoginScene. Pick a profile + 4-digit PIN, or create a
## new one (name + PIN). On success, switches the save profile and re-inits the
## ELO/learner managers, then routes to the main menu. Uses the tested
## ProfileManager for all profile/PIN logic.

## Clears the language chips in the top-right corner. Kept as tight as that
## allows: the create-a-player step is the tallest sub-state and every pixel
## spent here pushed its last button off the bottom of a 540-tall screen.
const LIST_TOP_MARGIN := 60.0
const LIST_BOTTOM_MARGIN := 10.0

const PIN_DOT_COUNT := 4
const PIN_DOT_SIZE := 22.0
const PIN_DOT_GAP := 14
const PIN_FIELD_WIDTH := 240.0
const PIN_FIELD_HEIGHT := 60.0

var _selected_user := ""
## Every PIN field on the current sub-state. The create screen has two.
var _pin_fields: Array[LineEdit] = []
var _pin_confirm_edit: LineEdit
var _scroll: ScrollContainer
var _col: VBoxContainer
var _pin_edit: LineEdit
var _name_edit: LineEdit
var _birth_year_edit: LineEdit
var _status: Label

func _ready() -> void:
	# Painted world behind the sign-in, not the project's flat clear colour. This
	# is the first screen anyone ever sees and it was a blue page with a grey
	# rectangle on it (brand/BRAND_SYSTEM.md §5.4).
	BrandTheme.apply(self)
	add_child(ScreenBackdrop.new())

	# The profile list scrolls: laid out flat, a family with four or more
	# children pushes "+ New User" off the bottom of the 540-tall viewport and
	# a fifth can never be added -- the same defect the web build shipped.
	_scroll = ScrollContainer.new()
	_scroll.anchor_right = 1.0
	_scroll.anchor_bottom = 1.0
	_scroll.offset_top = LIST_TOP_MARGIN
	_scroll.offset_bottom = -LIST_BOTTOM_MARGIN
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	# Keeps a focused field on screen once the PIN step makes the column taller
	# than the viewport.
	_scroll.follow_focus = true
	add_child(_scroll)

	_col = VBoxContainer.new()
	# Centred, not top-aligned: with one or two players the list is short, and
	# pinned to the top it left three quarters of the screen empty under it.
	# The scroller still takes over the moment the column outgrows the viewport.
	_col.alignment = BoxContainer.ALIGNMENT_CENTER
	_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_col.add_theme_constant_override("separation", 10)
	_scroll.add_child(_col)
	# Language selector sits outside `_col`, so it survives the sub-state swaps
	# and is reachable *before* the PIN screen -- this is where a parent sets the
	# language up on first launch.
	add_child(LanguageToggle.build(_on_locale_changed))
	_show_profile_list()


func _on_locale_changed() -> void:
	SceneRouter.goto("login")

func _clear() -> void:
	# The PIN fields go with the sub-state they belonged to. queue_free() only
	# schedules the node, so a stale entry stays valid for a frame or two and
	# _process would keep driving dots that are on their way out.
	_pin_fields.clear()
	_pin_confirm_edit = null
	for c in _col.get_children():
		c.queue_free()

## Headings carry their own contrast: they now sit on a painted sky rather than
## a flat fill, so plain white text would borrow its legibility from whichever
## world is behind it (§8.6b).
func _title(text: String, size := 40) -> void:
	var t := Label.new()
	t.text = text
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.add_theme_font_size_override("font_size", size)
	t.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	t.add_theme_color_override("font_shadow_color", ThemeManager.get_color_value("ink"))
	t.add_theme_constant_override("shadow_offset_x", 2)
	t.add_theme_constant_override("shadow_offset_y", 3)
	_col.add_child(t)

func _show_profile_list() -> void:
	_clear()
	_title(TextManager.t("login.subtitle"), 46)
	# Each player is a paper card; adding one is the quieter ghost action. When
	# every entry was an identical grey slab, "+ New User" looked exactly as
	# important as the child's own name, which is backwards on a screen a family
	# uses every day.
	var profiles := ProfileManager.get_profiles()
	var first: BrandButton = null
	for p in profiles:
		var uname := String(p.get("username", ""))
		var b := BrandButton.make(uname, BrandButton.Role.SECONDARY,
			func(): _show_pin_entry(uname))
		b.custom_minimum_size.x = 320
		b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		_col.add_child(b)
		if first == null:
			first = b

	var role: int = BrandButton.Role.GHOST if profiles.size() > 0 else BrandButton.Role.PRIMARY
	var nb := BrandButton.make(TextManager.t("login.new_user"), role, _show_new_player)
	nb.custom_minimum_size.x = 320
	nb.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_col.add_child(nb)
	if first == null:
		first = nb

	# THE ROW THAT MAKES A STRANGE COMPUTER USABLE.
	#
	# The list above is the profiles ON THIS DEVICE, and for most of this game's
	# life that was the only way in -- so a child sitting at a machine that had
	# never seen them had exactly one option, "New player", which builds a second
	# empty profile while their real progress sits somewhere they cannot reach.
	# The owner asked for the opposite: "I wanna log into my progress at work
	# tomorrow."
	#
	# So a name typed here is checked against the SERVER. Offered only where there
	# is a server to check against: a build with no API behind it would be showing
	# a door that opens onto nothing.
	if CloudSync.has_server():
		var sb := BrandButton.make(TextManager.t("login.i_have_a_name"),
			BrandButton.Role.GHOST, _show_sign_in)
		sb.custom_minimum_size.x = 320
		sb.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		_col.add_child(sb)

	first.grab_focus.call_deferred()

## Signing in as a name that is not on this device.
##
## Deliberately the same two fields as the local PIN screen, in the same order,
## because it is the same two facts -- a child should not have to understand that
## one of these screens talks to a server and the other does not.
func _show_sign_in() -> void:
	_clear()
	_title(TextManager.t("login.sign_in_title"), 34)
	_name_edit = LineEdit.new()
	_name_edit.placeholder_text = TextManager.t("login.name_placeholder")
	_name_edit.max_length = ProfileManager.NAME_MAX_LENGTH
	_name_edit.custom_minimum_size = Vector2(280, 48)
	_name_edit.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_col.add_child(_name_edit)
	_title(TextManager.t("login.enter_pin"), 22)
	_pin_edit = _make_pin_edit()
	_status = _make_status()
	_col.add_child(_status)
	_action_button(TextManager.t("login.play"), _try_sign_in, BrandButton.Role.PRIMARY)
	_action_button(TextManager.t("login.back"), _show_profile_list)
	_name_edit.grab_focus()

## Ask the server, then make this device look like the one the child left.
##
## A successful sign-in creates the LOCAL profile too, with the same name and
## PIN, so everything downstream -- the save key, the PIN screen on the next
## launch, the profile list -- works exactly as it does on the child's own
## tablet. The server is where the save comes from; it is not a second identity
## system running beside the local one.
func _try_sign_in() -> void:
	var username := _name_edit.text.strip_edges()
	var pin := _pin_edit.text
	_status.text = TextManager.t("login.signing_in")
	var res: Dictionary = await CloudSync.sign_in(username, pin)
	if not bool(res.get("ok", false)):
		_status.text = TextManager.t(String(res.get("error", "login.sign_in_failed")))
		_pin_edit.text = ""
		_pin_edit.grab_focus()
		return
	# create_profile returns a string table key on failure; the one failure that
	# can happen here is "that name is already on this device", which for a name
	# the server just authenticated means the local profile is simply already
	# there. Logging in is then the whole of the work.
	if ProfileManager.get_profile(username) == null:
		ProfileManager.create_profile(username, pin, 0)
	if not ProfileManager.login(username, pin):
		# The name exists locally with a DIFFERENT pin -- somebody else's profile
		# on a shared machine. The server said this child is who they say they
		# are, so the local record is the stale one.
		ProfileManager.set_profile_pin(username, pin)
		if not ProfileManager.login(username, pin):
			_status.text = TextManager.t("login.sign_in_failed")
			return
	_finish_login()

func _show_pin_entry(username: String) -> void:
	_selected_user = username
	_clear()
	_title(TextManager.t("login.hi", [username]), 32)
	_title(TextManager.t("login.enter_pin"), 22)
	# _make_pin_edit() has already parented this inside its own frame and added
	# that frame to _col. Adding it to _col again is what Godot refused with
	# "already has a parent" on every visit to this screen — invisible, because
	# the rejected add left the field exactly where it belonged.
	_pin_edit = _make_pin_edit()
	_status = _make_status()
	_col.add_child(_status)
	_action_button(TextManager.t("login.play"), func(): _try_login(username, _pin_edit.text), BrandButton.Role.PRIMARY)
	_action_button(TextManager.t("login.back"), _show_profile_list, BrandButton.Role.GHOST)
	_pin_edit.grab_focus()

func _show_new_player() -> void:
	_clear()
	_title(TextManager.t("login.create_title"), 34)
	_name_edit = LineEdit.new()
	_name_edit.placeholder_text = TextManager.t("login.name_placeholder")
	_name_edit.max_length = ProfileManager.NAME_MAX_LENGTH
	_name_edit.custom_minimum_size = Vector2(280, 48)
	_name_edit.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_col.add_child(_name_edit)
	_title(TextManager.t("login.pick_pin"), 22)
	# Already parented by _make_pin_edit() — see the PIN screen above.
	_pin_edit = _make_pin_edit()
	# Typed twice, because a PIN is the only thing standing between a child and
	# their own save and there is no way to recover a mistyped one: the profile
	# would be created around four digits nobody knows. The login screen asks
	# once -- a wrong PIN there costs a retry, not a save.
	_title(TextManager.t("login.pin_again"), 22)
	_pin_confirm_edit = _make_pin_edit()
	# Birth YEAR, optional, for the parent report's grade comparison. A year and
	# not a date on purpose: Icelandic school grade depends only on the calendar
	# year of birth (docs/GRADE_EXPECTATIONS.md), so a date would be data about a
	# child collected for nothing. Skipping it just skips the grade section.
	_title(TextManager.t("login.birth_year_label"), 22)
	_birth_year_edit = LineEdit.new()
	_birth_year_edit.placeholder_text = TextManager.t("login.birth_year_placeholder")
	_birth_year_edit.max_length = 4
	_birth_year_edit.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_NUMBER
	_birth_year_edit.custom_minimum_size = Vector2(280, 48)
	_birth_year_edit.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_col.add_child(_birth_year_edit)
	_status = _make_status()
	_col.add_child(_status)
	_action_button(TextManager.t("login.create"), _try_create, BrandButton.Role.PRIMARY)
	_action_button(TextManager.t("login.back"), _show_profile_list, BrandButton.Role.GHOST)
	_name_edit.grab_focus()

## The PIN field and its dots are one object.
##
## They used to be two stacked children: an empty paper box with nothing in it
## (the LineEdit is `secret`, so it never shows a character) and a separate row
## of dots above it. A child saw a blank box and a row of circles and had to
## guess which one they were filling in.
##
## Now the input sits behind the dots at the same size and is invisible - its
## text, caret and background are all transparent - so the dots *are* the field.
## Tapping anywhere on it focuses the real LineEdit underneath.
##
## Each field owns its own dots, in metadata rather than in a field on this
## scene, because the create screen has TWO PIN fields now and a single
## `_pin_dots` variable meant the second one silently drove the first one's dots.
func _make_pin_edit(numeric := true) -> LineEdit:
	var frame := Control.new()
	frame.custom_minimum_size = Vector2(PIN_FIELD_WIDTH, PIN_FIELD_HEIGHT)
	frame.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_col.add_child(frame)

	var e := LineEdit.new()
	e.max_length = PIN_DOT_COUNT
	e.secret = true
	e.alignment = HORIZONTAL_ALIGNMENT_CENTER
	if numeric:
		# So a touch device offers a number pad rather than a full qwerty for
		# four digits. Same reason the birth-year field does it.
		e.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_NUMBER
	e.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	# Invisible, not hidden: a hidden LineEdit cannot take focus or a tap.
	# Color.TRANSPARENT rather than a literal: this is the absence of a colour,
	# not a palette choice, so it does not belong in the theme data the hardcode
	# guard is protecting.
	e.add_theme_color_override("font_color", Color.TRANSPARENT)
	e.add_theme_color_override("caret_color", Color.TRANSPARENT)
	frame.add_child(e)

	var dots := _make_pin_dots()
	dots.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dots.mouse_filter = Control.MOUSE_FILTER_IGNORE
	frame.add_child(dots)
	e.set_meta("pin_dots", dots)
	e.set_meta("pin_shown", -1)
	e.set_meta("pin_reveal_index", -1)
	e.set_meta("pin_reveal_until", 0)

	e.text_changed.connect(func(_t): _sync_pin_dots(e))
	_pin_fields.append(e)
	_sync_pin_dots(e)
	return e

## Keep every PIN field's dots honest, every frame.
##
## WHY A POLL AND NOT JUST THE SIGNAL. `text_changed` is emitted when a key
## reaches the LineEdit, which is what happens on a machine with a keyboard. It
## is NOT what happens on the device this game is for. With
## html/experimental_virtual_keyboard on -- and it has to be on, or an iPad
## cannot type at all -- a focused LineEdit is served by a DOM <input> Godot
## injects, and the text comes back through the engine's own virtual-keyboard
## path without raising that signal. So the PIN went in, the profile was created
## from it, and all four dots sat there empty the whole time: a child pressing
## digits and being told nothing at all.
##
## Reproduced before it was fixed, in the exported build, by
## godot/tools/pin_entry_probe.mjs -- which drives both paths and counts the
## filled dots off the frame.
##
## Polling four panels per frame against an integer is not a cost worth
## avoiding, and unlike the signal it cannot be bypassed by an input path nobody
## thought of.
func _process(_delta: float) -> void:
	for e in _pin_fields:
		if is_instance_valid(e):
			_sync_pin_dots(e)

func _sync_pin_dots(e: LineEdit) -> void:
	if not is_instance_valid(e) or not e.has_meta("pin_dots"):
		return
	var text := e.text
	var length := text.length()
	var shown := int(e.get_meta("pin_shown", -1))
	var reveal_index := int(e.get_meta("pin_reveal_index", -1))
	var reveal_until := int(e.get_meta("pin_reveal_until", 0))
	var now := Time.get_ticks_msec()

	# A digit that has just been typed shows itself for a moment before it
	# becomes a dot. Four-digit PINs are typed by five-year-olds who are still
	# learning which key is which, and a field that never shows a character gives
	# them no way to tell a mis-hit from a hit -- while a PIN that stayed on
	# screen would defeat the point of it on a shared iPad. So: the newest digit,
	# briefly, and never more than one.
	if length > shown and length > 0:
		reveal_index = length - 1
		reveal_until = now + int(Config.ui("login/pin_reveal_ms", 900))
		e.set_meta("pin_reveal_index", reveal_index)
		e.set_meta("pin_reveal_until", reveal_until)
	var revealing := reveal_index >= 0 and now < reveal_until and reveal_index < length
	if reveal_index >= 0 and not revealing:
		e.set_meta("pin_reveal_index", -1)

	# Redraw only when something a viewer could see has changed.
	var state := "%d/%d" % [length, reveal_index if revealing else -1]
	if e.get_meta("pin_state", "") == state:
		return
	e.set_meta("pin_state", state)
	e.set_meta("pin_shown", length)
	_render_pin_dots(e.get_meta("pin_dots") as HBoxContainer, text,
		reveal_index if revealing else -1)

func _render_pin_dots(dots: HBoxContainer, text: String, reveal_index: int) -> void:
	if dots == null:
		return
	var filled := mini(text.length(), PIN_DOT_COUNT)
	for i in dots.get_child_count():
		var dot := dots.get_child(i) as Panel
		var is_reveal := i == reveal_index
		# A revealed digit sits ON a filled dot rather than inside an empty ring:
		# the ring plus a numeral drew two shapes on top of each other at the same
		# size and the digit came out cramped against the border. Filled, the row
		# also keeps saying the same thing about progress whether or not the
		# newest digit is still showing.
		dot.add_theme_stylebox_override("panel", _pin_dot_style(i < filled))
		var label := dot.get_child(0) as Label
		label.text = text.substr(i, 1) if is_reveal else ""


## PIN placeholders drawn as circles instead of text glyphs.
##
## These used to be the characters U+25CF / U+25CB in a Label. Both live in the
## Unicode "Geometric Shapes" block, which Godot's built-in font does not carry,
## so every dot rendered as a missing-glyph box printing its own hex codepoint --
## the child got no feedback that a keypress had registered. A rounded StyleBox
## has no font dependency, so it cannot fail that way.
func _make_pin_dots() -> HBoxContainer:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", PIN_DOT_GAP)
	for _i in PIN_DOT_COUNT:
		var dot := Panel.new()
		dot.custom_minimum_size = Vector2(PIN_DOT_SIZE, PIN_DOT_SIZE)
		# Shrink-centre, or the row stretches each dot to the full height of the
		# field it now sits inside and the circles render as tall ovals.
		dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		dot.add_theme_stylebox_override("panel", _pin_dot_style(false))
		# The numeral for the brief reveal. Always present and usually empty, so
		# a reveal is a text change rather than a node being built mid-typing.
		var label := Label.new()
		label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		# Smaller than the dot, so the numeral sits inside the circle instead of
		# against its edge, and in paper because it is drawn on filled ink.
		label.add_theme_font_size_override("font_size", int(PIN_DOT_SIZE * 0.8))
		label.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		dot.add_child(label)
		row.add_child(dot)
	return row


func _pin_dot_style(filled: bool) -> StyleBoxFlat:
	# Ink, not paper: the dots moved inside the paper field, where a paper dot on
	# a paper card is an invisible dot.
	var colour := ThemeManager.get_color_value("ink")
	var box := StyleBoxFlat.new()
	# Corner radius at half the box size turns the square into a circle.
	var radius := int(PIN_DOT_SIZE / 2.0)
	box.set_corner_radius_all(radius)
	box.bg_color = colour if filled else Color(colour, 0.0)
	box.border_color = colour
	box.set_border_width_all(3)
	return box


func _make_status() -> Label:
	var l := Label.new()
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_color_override("font_color", ThemeManager.get_color_value("notyet"))
	l.add_theme_color_override("font_shadow_color", ThemeManager.get_color_value("ink"))
	l.add_theme_constant_override("shadow_offset_x", 2)
	l.add_theme_constant_override("shadow_offset_y", 2)
	l.add_theme_font_size_override("font_size", 22)
	return l

func _action_button(text: String, cb: Callable, role: int = BrandButton.Role.SECONDARY) -> void:
	var b := BrandButton.make(text, role, cb)
	b.custom_minimum_size.x = 320
	b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_col.add_child(b)

func _try_login(username: String, pin: String) -> void:
	if ProfileManager.login(username, pin):
		_finish_login()
	else:
		_status.text = TextManager.t("login.wrong_pin")
		_pin_edit.text = ""

func _try_create() -> void:
	# Optional: empty passes, a typed year must be plausible for a school-age
	# child so a typo cannot silently poison the grade comparison.
	var birth_year := 0
	var raw_year := _birth_year_edit.text.strip_edges()
	if not raw_year.is_empty():
		var this_year: int = Time.get_datetime_dict_from_system().get("year", 0)
		birth_year = raw_year.to_int()
		if birth_year < this_year - 17 or birth_year > this_year:
			_status.text = TextManager.t("login.birth_year_invalid")
			return
	# Before create_profile, so a mismatch costs a retype rather than a profile.
	if _pin_confirm_edit != null and _pin_edit.text != _pin_confirm_edit.text:
		_status.text = TextManager.t("login.pin_mismatch")
		_pin_confirm_edit.text = ""
		_pin_confirm_edit.grab_focus()
		return
	var res = ProfileManager.create_profile(_name_edit.text, _pin_edit.text, birth_year)
	if res != true:
		# create_profile returns a string table key, not a sentence.
		_status.text = TextManager.t(String(res))
		return
	# CLAIM THE NAME ON THE SERVER TOO, so this child exists somewhere other than
	# this device. Without it, "log in at work tomorrow" has nothing to find.
	#
	# A failure here is NOT a failure to create a player. The game is
	# offline-first and always has been: a child on a train, or on a build with
	# no API behind it, gets a local profile and plays. The one answer worth
	# stopping for is "that name is taken", because it is the child's own name
	# that will not work tomorrow and they can still pick another one now.
	if CloudSync.has_server():
		var claim: Dictionary = await CloudSync.sign_up(
			_name_edit.text.strip_edges(), _pin_edit.text)
		if not bool(claim.get("ok", false)) and String(claim.get("error", "")) == "login.name_taken":
			ProfileManager.delete_profile(_name_edit.text.strip_edges())
			_status.text = TextManager.t("login.name_taken")
			return
	ProfileManager.login(_name_edit.text, _pin_edit.text)
	_finish_login()

func _finish_login() -> void:
	SaveManager.switch_profile()
	# Map this device's local childId to the server child and pull the cloud save
	# if this device is enrolled. A no-op otherwise, and never blocking: the local
	# save is already loaded and playable by this point.
	if CloudSync.is_enrolled():
		CloudSync.bind_active_profile()
	var save := SaveManager.get_data()
	ELOManager.initialize(save.get("eloStats", null))
	LearnerStateManager.initialize(ProfileManager.get_active_profile(), save.get("learnerState", null), ELOManager.get_stats())
	# Where this child STARTS, from the birth year already on the profile. Before
	# LearnerSyncService.init so the snapshot it caches is the seeded one, and
	# after initialize so there is a snapshot to seed. A no-op for a returning
	# child, for a leikskóli child and for a profile with no birth year on file
	# (MathPlacement.apply_seed).
	MathPlacement.apply_seed(ProfileManager.get_active_profile())
	LearnerSyncService.init(LearnerStateManager.get_snapshot())
	MathProblemManager.hydrate_recent_problems(save.get("telemetry", {}).get("answeredProblemIds", []))
	SceneRouter.goto("main_menu")
