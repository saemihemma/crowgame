extends CanvasLayer
## CloudPanel — the parent-facing cloud-save surface.
##
## Deliberately plain and deliberately for the grown-up, not the child. It does
## three things:
##
##   1. turn cloud save on, by emailing a sign-in link
##   2. show a pairing code so a second device can join the same family
##   3. type in a code received from another device
##
## The link must be opened on THIS device: clicking it is the top-level
## navigation whose response sets the HttpOnly cookie. A cookie set that way
## survives Safari's eviction of script-writable storage, which is exactly the
## failure this feature exists to prevent — see ARCHITECTURE.md.
##
## No PIN is ever involved here. The PIN is a "which kid am I" selector on a
## shared device and never leaves it.

signal closed

var _status: Label
var _email_field: LineEdit
var _code_field: LineEdit
var _column: VBoxContainer

func _ready() -> void:
	layer = int(Config.ui("cloud_panel/layer", 20))
	var shade := ColorRect.new()
	shade.color = ThemeManager.get_color_value("overlay_shade")
	shade.anchor_right = 1.0
	shade.anchor_bottom = 1.0
	add_child(shade)

	var center := CenterContainer.new()
	center.anchor_right = 1.0
	center.anchor_bottom = 1.0
	add_child(center)

	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(
		Config.ui("cloud_panel/width", 720), Config.ui("cloud_panel/min_height", 420))
	center.add_child(panel)

	_column = VBoxContainer.new()
	_column.add_theme_constant_override("separation", int(Config.ui("cloud_panel/separation", 16)))
	panel.add_child(_column)

	var title := Label.new()
	title.text = TextManager.t("cloud_title")
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", int(Config.ui("cloud_panel/title_font_size", 40)))
	title.add_theme_color_override("font_color", ThemeManager.get_color_value("text_primary"))
	_column.add_child(title)

	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.add_theme_font_size_override("font_size", int(Config.ui("cloud_panel/body_font_size", 24)))
	_status.add_theme_color_override("font_color", ThemeManager.get_color_value("text_dim"))
	_column.add_child(_status)

	_rebuild()
	CloudSync.state_changed.connect(func(_enrolled: bool) -> void: _rebuild())

func _rebuild() -> void:
	for child in _column.get_children():
		if child is Label and child != _status:
			continue
		if child == _status:
			continue
		child.queue_free()

	if CloudSync.is_enrolled():
		_status.text = TextManager.t("cloud_on")
		_add_button(TextManager.t("cloud_pair_show"), _on_show_pairing_code)
	else:
		# The cheapest protection against a browser discarding a child's progress
		# is a home-screen install, which is not subject to Safari's seven-day
		# eviction of script-writable storage. Free, and it works before any
		# account exists.
		_status.text = "%s\n\n%s" % [
			TextManager.t("cloud_off"), TextManager.t("cloud_home_screen")]
		_email_field = _add_field(TextManager.t("cloud_email_prompt"))
		_add_button(TextManager.t("cloud_email_send"), _on_send_link)
		_code_field = _add_field(TextManager.t("cloud_pair_prompt"))
		_add_button(TextManager.t("cloud_pair_enter"), _on_redeem_code)

	_add_button(TextManager.t("menu.back"), func() -> void:
		closed.emit()
		queue_free())

func _add_field(placeholder: String) -> LineEdit:
	var field := LineEdit.new()
	field.placeholder_text = placeholder
	field.custom_minimum_size = Vector2(
		Config.ui("cloud_panel/field_width", 520), Config.ui("cloud_panel/field_height", 64))
	field.add_theme_font_size_override("font_size", int(Config.ui("cloud_panel/body_font_size", 24)))
	_column.add_child(field)
	return field

func _add_button(text: String, cb: Callable) -> void:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(
		Config.ui("cloud_panel/button_width", 420), Config.ui("cloud_panel/button_height", 72))
	b.add_theme_font_size_override("font_size", int(Config.ui("cloud_panel/body_font_size", 24)))
	b.pressed.connect(cb)
	UiFx.attach_focus_highlight(b)
	_column.add_child(b)

func _on_send_link() -> void:
	var email := _email_field.text.strip_edges()
	# Not full RFC validation, and it should not be: the server is the authority.
	# This only catches the obvious typo before spending a round trip.
	if not email.contains("@") or not email.contains("."):
		_status.text = TextManager.t("cloud_email_invalid")
		return
	# The message never reveals whether the address is already known — that is
	# identical for both. But it DOES distinguish "no mail provider configured",
	# because telling a parent to check an inbox that will never receive anything
	# is worse than telling them the feature is not ready.
	var delivery: String = await CloudSync.request_login_link(email)
	match delivery:
		"configured":
			_status.text = TextManager.t("cloud_email_sent")
		"unavailable":
			_status.text = TextManager.t("cloud_delivery_unavailable")
		_:
			_status.text = TextManager.t("cloud_offline")

func _on_show_pairing_code() -> void:
	var code: String = await CloudSync.request_pairing_code()
	if code.is_empty():
		_status.text = TextManager.t("cloud_offline")
		return
	_status.text = TextManager.t("cloud_pair_code", [code])

func _on_redeem_code() -> void:
	var ok: bool = await CloudSync.redeem_pairing_code(_code_field.text)
	if ok:
		await CloudSync.bind_active_profile()
		_rebuild()
	else:
		_status.text = TextManager.t("cloud_pair_bad")
