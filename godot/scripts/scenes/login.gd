extends Control
## Login — Godot port of LoginScene. Pick a profile + 4-digit PIN, or create a
## new one (name + PIN). On success, switches the save profile and re-inits the
## ELO/learner managers, then routes to the main menu. Uses the tested
## ProfileManager for all profile/PIN logic.

var _selected_user := ""
var _col: VBoxContainer
var _pin_edit: LineEdit
var _name_edit: LineEdit
var _status: Label

func _ready() -> void:
	var center := CenterContainer.new()
	center.anchor_right = 1.0
	center.anchor_bottom = 1.0
	add_child(center)
	_col = VBoxContainer.new()
	_col.alignment = BoxContainer.ALIGNMENT_CENTER
	_col.add_theme_constant_override("separation", 14)
	center.add_child(_col)
	_show_profile_list()

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
	_title("Who's playing?")
	for p in ProfileManager.get_profiles():
		var b := Button.new()
		b.text = String(p.get("username", ""))
		b.custom_minimum_size = Vector2(280, 56)
		b.add_theme_font_size_override("font_size", 28)
		var uname := String(p.get("username", ""))
		b.pressed.connect(func(): _show_pin_entry(uname))
		UiFx.attach_focus_highlight(b)
		_col.add_child(b)
	var nb := Button.new()
	nb.text = "+ New Player"
	nb.custom_minimum_size = Vector2(280, 56)
	nb.pressed.connect(_show_new_player)
	UiFx.attach_focus_highlight(nb)
	_col.add_child(nb)

func _show_pin_entry(username: String) -> void:
	_selected_user = username
	_clear()
	_title("Hi, %s!" % username, 32)
	_title("Enter your 4-digit PIN", 22)
	_pin_edit = _make_pin_edit()
	_col.add_child(_pin_edit)
	_status = _make_status()
	_col.add_child(_status)
	_action_button("Play", func(): _try_login(username, _pin_edit.text))
	_action_button("Back", _show_profile_list)
	_pin_edit.grab_focus()

func _show_new_player() -> void:
	_clear()
	_title("New Player", 32)
	_name_edit = LineEdit.new()
	_name_edit.placeholder_text = "Your name"
	_name_edit.max_length = 12
	_name_edit.custom_minimum_size = Vector2(280, 48)
	_col.add_child(_name_edit)
	_title("Pick a 4-digit PIN", 22)
	_pin_edit = _make_pin_edit()
	_col.add_child(_pin_edit)
	_status = _make_status()
	_col.add_child(_status)
	_action_button("Create", _try_create)
	_action_button("Back", _show_profile_list)
	_name_edit.grab_focus()

var _pin_dots: Label

func _make_pin_edit() -> LineEdit:
	var e := LineEdit.new()
	e.max_length = 4
	e.secret = true
	e.alignment = HORIZONTAL_ALIGNMENT_CENTER
	e.custom_minimum_size = Vector2(160, 48)
	# Kid-friendly PIN dots (LoginScene.ts shows filled/empty circles per digit).
	_pin_dots = Label.new()
	_pin_dots.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_pin_dots.add_theme_font_size_override("font_size", 30)
	_col.add_child(_pin_dots)
	e.text_changed.connect(_update_pin_dots)
	_update_pin_dots("")
	return e

func _update_pin_dots(text: String) -> void:
	if _pin_dots == null:
		return
	var filled := mini(text.length(), 4)
	_pin_dots.text = "● ".repeat(filled) + "○ ".repeat(4 - filled)

func _make_status() -> Label:
	var l := Label.new()
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_color_override("font_color", Color(1, 0.5, 0.5))
	return l

func _action_button(text: String, cb: Callable) -> void:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(280, 52)
	b.pressed.connect(cb)
	UiFx.attach_focus_highlight(b)
	_col.add_child(b)

func _try_login(username: String, pin: String) -> void:
	if ProfileManager.login(username, pin):
		_finish_login()
	else:
		_status.text = "Wrong PIN, try again!"
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
	var save := SaveManager.get_data()
	ELOManager.initialize(save.get("eloStats", null))
	LearnerStateManager.initialize(ProfileManager.get_active_profile(), save.get("learnerState", null), ELOManager.get_stats())
	MathProblemManager.hydrate_recent_problems(save.get("telemetry", {}).get("answeredProblemIds", []))
	get_tree().change_scene_to_file("res://scenes/MainMenu.tscn")
