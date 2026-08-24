extends Control
## Login — Godot port of LoginScene. Pick a profile + 4-digit PIN, or create a
## new one (name + PIN). On success, switches the save profile and re-inits the
## ELO/learner managers, then routes to the main menu. Uses the tested
## ProfileManager for all profile/PIN logic.

const LIST_TOP_MARGIN := 24.0
const LIST_BOTTOM_MARGIN := 16.0

const PIN_DOT_COUNT := 4
const PIN_DOT_SIZE := 22.0
const PIN_DOT_GAP := 12

var _selected_user := ""
var _scroll: ScrollContainer
var _col: VBoxContainer
var _pin_edit: LineEdit
var _name_edit: LineEdit
var _status: Label

func _ready() -> void:
	# The profile list scrolls: laid out flat, a family with four or more
	# children pushes "+ New User" off the bottom of the 540-tall viewport and
	# a fifth can never be added -- the same defect the web build shipped.
	_scroll = ScrollContainer.new()
	_scroll.anchor_right = 1.0
	_scroll.anchor_bottom = 1.0
	_scroll.offset_top = LIST_TOP_MARGIN
	_scroll.offset_bottom = -LIST_BOTTOM_MARGIN
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(_scroll)

	_col = VBoxContainer.new()
	_col.alignment = BoxContainer.ALIGNMENT_BEGIN
	_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_col.add_theme_constant_override("separation", 14)
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

func _title(text: String, size := 40) -> void:
	var t := Label.new()
	t.text = text
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.add_theme_font_size_override("font_size", size)
	_col.add_child(t)

func _show_profile_list() -> void:
	_clear()
	_title(TextManager.t("login.subtitle"))
	for p in ProfileManager.get_profiles():
		var b := Button.new()
		b.text = String(p.get("username", ""))
		b.custom_minimum_size = Vector2(280, 56)
		b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		b.add_theme_font_size_override("font_size", 28)
		var uname := String(p.get("username", ""))
		b.pressed.connect(func(): _show_pin_entry(uname))
		UiFx.attach_focus_highlight(b)
		_col.add_child(b)
	var nb := Button.new()
	nb.text = TextManager.t("login.new_user")
	nb.custom_minimum_size = Vector2(280, 56)
	nb.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	nb.pressed.connect(_show_new_player)
	UiFx.attach_focus_highlight(nb)
	_col.add_child(nb)

func _show_pin_entry(username: String) -> void:
	_selected_user = username
	_clear()
	_title(TextManager.t("login.hi", [username]), 32)
	_title(TextManager.t("login.enter_pin"), 22)
	_pin_edit = _make_pin_edit()
	_col.add_child(_pin_edit)
	_status = _make_status()
	_col.add_child(_status)
	_action_button(TextManager.t("login.play"), func(): _try_login(username, _pin_edit.text))
	_action_button(TextManager.t("login.back"), _show_profile_list)
	_pin_edit.grab_focus()

func _show_new_player() -> void:
	_clear()
	_title(TextManager.t("login.create_title"), 32)
	_name_edit = LineEdit.new()
	_name_edit.placeholder_text = TextManager.t("login.name_placeholder")
	_name_edit.max_length = 12
	_name_edit.custom_minimum_size = Vector2(280, 48)
	_name_edit.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_col.add_child(_name_edit)
	_title(TextManager.t("login.pick_pin"), 22)
	_pin_edit = _make_pin_edit()
	_col.add_child(_pin_edit)
	_status = _make_status()
	_col.add_child(_status)
	_action_button(TextManager.t("login.create"), _try_create)
	_action_button(TextManager.t("login.back"), _show_profile_list)
	_name_edit.grab_focus()

var _pin_dots: HBoxContainer

func _make_pin_edit() -> LineEdit:
	var e := LineEdit.new()
	e.max_length = 4
	e.secret = true
	e.alignment = HORIZONTAL_ALIGNMENT_CENTER
	e.custom_minimum_size = Vector2(160, 48)
	e.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	# Kid-friendly PIN dots (LoginScene.ts shows filled/empty circles per digit).
	_pin_dots = _make_pin_dots()
	_col.add_child(_pin_dots)
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
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_theme_constant_override("separation", PIN_DOT_GAP)
	for _i in PIN_DOT_COUNT:
		var dot := Panel.new()
		dot.custom_minimum_size = Vector2(PIN_DOT_SIZE, PIN_DOT_SIZE)
		dot.add_theme_stylebox_override("panel", _pin_dot_style(false))
		row.add_child(dot)
	return row


func _pin_dot_style(filled: bool) -> StyleBoxFlat:
	var colour := ThemeManager.get_color_value("text_light")
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
	l.add_theme_color_override("font_color", ThemeManager.get_color_value("text_error"))
	return l

func _action_button(text: String, cb: Callable) -> void:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(280, 52)
	b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	b.pressed.connect(cb)
	UiFx.attach_focus_highlight(b)
	_col.add_child(b)

func _try_login(username: String, pin: String) -> void:
	if ProfileManager.login(username, pin):
		_finish_login()
	else:
		_status.text = TextManager.t("login.wrong_pin")
		_pin_edit.text = ""

func _try_create() -> void:
	var res = ProfileManager.create_profile(_name_edit.text, _pin_edit.text)
	if res == true:
		ProfileManager.login(_name_edit.text, _pin_edit.text)
		_finish_login()
	else:
		_status.text = String(res)

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
