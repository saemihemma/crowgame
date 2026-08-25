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
	first.grab_focus.call_deferred()

func _show_pin_entry(username: String) -> void:
	_selected_user = username
	_clear()
	_title(TextManager.t("login.hi", [username]), 32)
	_title(TextManager.t("login.enter_pin"), 22)
	_pin_edit = _make_pin_edit()
	_col.add_child(_pin_edit)
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
	_pin_edit = _make_pin_edit()
	_col.add_child(_pin_edit)
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

var _pin_dots: HBoxContainer

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
func _make_pin_edit() -> LineEdit:
	var frame := Control.new()
	frame.custom_minimum_size = Vector2(PIN_FIELD_WIDTH, PIN_FIELD_HEIGHT)
	frame.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_col.add_child(frame)

	var e := LineEdit.new()
	e.max_length = PIN_DOT_COUNT
	e.secret = true
	e.alignment = HORIZONTAL_ALIGNMENT_CENTER
	e.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	# Invisible, not hidden: a hidden LineEdit cannot take focus or a tap.
	# Color.TRANSPARENT rather than a literal: this is the absence of a colour,
	# not a palette choice, so it does not belong in the theme data the hardcode
	# guard is protecting.
	e.add_theme_color_override("font_color", Color.TRANSPARENT)
	e.add_theme_color_override("caret_color", Color.TRANSPARENT)
	frame.add_child(e)

	_pin_dots = _make_pin_dots()
	_pin_dots.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_pin_dots.mouse_filter = Control.MOUSE_FILTER_IGNORE
	frame.add_child(_pin_dots)

	e.text_changed.connect(_update_pin_dots)
	_update_pin_dots("")
	return e

func _update_pin_dots(text: String) -> void:
	if _pin_dots == null:
		return
	var filled := mini(text.length(), 4)
	for i in _pin_dots.get_child_count():
		var dot := _pin_dots.get_child(i) as Panel
		dot.add_theme_stylebox_override("panel", _pin_dot_style(i < filled))


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
	var res = ProfileManager.create_profile(_name_edit.text, _pin_edit.text, birth_year)
	if res == true:
		ProfileManager.login(_name_edit.text, _pin_edit.text)
		_finish_login()
	else:
		# create_profile returns a string table key, not a sentence.
		_status.text = TextManager.t(String(res))

func _finish_login() -> void:
	SaveManager.switch_profile()
	# Map this device's local childId to the server child and pull the cloud save
	# if this device is enrolled. A no-op otherwise, and never blocking: the local
	# save is already loaded and playable by this point.
	if OS.has_feature("web") and CloudSync.is_enrolled():
		CloudSync.bind_active_profile()
	var save := SaveManager.get_data()
	ELOManager.initialize(save.get("eloStats", null))
	LearnerStateManager.initialize(ProfileManager.get_active_profile(), save.get("learnerState", null), ELOManager.get_stats())
	LearnerSyncService.init(LearnerStateManager.get_snapshot())
	MathProblemManager.hydrate_recent_problems(save.get("telemetry", {}).get("answeredProblemIds", []))
	SceneRouter.goto("main_menu")
