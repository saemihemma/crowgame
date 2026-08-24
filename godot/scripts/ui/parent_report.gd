extends CanvasLayer
## ParentReport — what a parent can see about their child's learning.
##
## PROJECT.md says parent visibility matters, and after the Godot port there was
## no way to get it: admin.html reads browser localStorage, while the game stores
## everything in user://crow_localstorage.json (IndexedDB on the web). Same key
## names, different storage engine — so the old page could not see this game's
## data at all. This replaces it in-engine, where the data actually lives.
##
## Scope, deliberately: this shows LEARNING, per child, per domain. It is not the
## translation editor admin.html also had. That was an authoring convenience, and
## shipping a live string editor to the public would let anyone on a shared family
## iPad rewrite what a child reads. Translations are edited in
## godot/data/i18n/strings_*.json, where CI keeps the locales in lockstep.
##
## Reads local profile saves, so it works with no network and no account.

signal closed

var _column: VBoxContainer

func _ready() -> void:
	layer = int(Config.ui("parent_report/layer", 21))
	var shade := ColorRect.new()
	shade.color = ThemeManager.get_color_value("overlay_shade")
	shade.anchor_right = 1.0
	shade.anchor_bottom = 1.0
	add_child(shade)

	var scroll := ScrollContainer.new()
	scroll.anchor_right = 1.0
	scroll.anchor_bottom = 1.0
	scroll.offset_left = Config.ui("parent_report/margin", 48)
	scroll.offset_top = Config.ui("parent_report/margin", 48)
	scroll.offset_right = -Config.ui("parent_report/margin", 48)
	scroll.offset_bottom = -Config.ui("parent_report/margin", 48)
	add_child(scroll)

	_column = VBoxContainer.new()
	_column.custom_minimum_size = Vector2(Config.ui("parent_report/width", 860), 0)
	_column.add_theme_constant_override("separation", int(Config.ui("parent_report/separation", 12)))
	scroll.add_child(_column)

	_heading(TextManager.t("report_title"), int(Config.ui("parent_report/title_font_size", 40)))
	_body(TextManager.t("report_what_this_is"))

	var profiles: Array = ProfileManager.get_profiles()
	if profiles.is_empty():
		_body(TextManager.t("report_no_children"))
	else:
		for profile in profiles:
			_render_child(profile)

	var back := Button.new()
	back.text = TextManager.t("menu.back")
	back.custom_minimum_size = Vector2(
		Config.ui("parent_report/button_width", 320), Config.ui("parent_report/button_height", 64))
	back.pressed.connect(func() -> void:
		closed.emit()
		queue_free())
	UiFx.attach_focus_highlight(back)
	_column.add_child(back)

func _render_child(profile: Dictionary) -> void:
	var username := String(profile.get("username", ""))
	_heading(username, int(Config.ui("parent_report/child_font_size", 30)))

	var snapshot := _snapshot_for(profile)
	if snapshot.is_empty():
		_body(TextManager.t("report_not_played_yet"))
		return

	var summary: Variant = snapshot.get("summary", {})
	if not (summary is Dictionary):
		_body(TextManager.t("report_not_played_yet"))
		return

	var domains: Variant = (summary as Dictionary).get("domains", [])
	if not (domains is Array):
		return

	for entry in domains:
		if not (entry is Dictionary):
			continue
		var d: Dictionary = entry
		# Locked domains are noise for a parent: the child has not met them yet.
		if not bool(d.get("unlocked", false)):
			continue
		_body(TextManager.t("report_domain_line", [
			TextManager.t("domain_" + String(d.get("domain", ""))),
			str(int(d.get("currentStep", 0))),
			str(int(round(float(d.get("firstAttemptAccuracy", 0.0)) * 100.0))),
			str(int(d.get("activeReviewCount", 0))),
		]))

	# Confidence is the number that explains behaviour a parent actually notices —
	# a child who has hit a rough patch gets easier questions on purpose.
	var conf := _lowest_confidence(domains)
	if conf < 0.0:
		_body(TextManager.t("report_confidence_low"))

func _snapshot_for(profile: Dictionary) -> Dictionary:
	# The learner snapshot is embedded in the child's save, which is the same
	# place the cloud sync treats as authoritative.
	var raw: Variant = Persistence.get_item(
		ProfileManager.get_save_key_for_user(String(profile.get("username", ""))))
	if raw == null:
		return {}
	var parsed: Variant = JSON.parse_string(String(raw))
	if not (parsed is Dictionary):
		return {}
	var learner: Variant = (parsed as Dictionary).get("learnerState", {})
	return learner if learner is Dictionary else {}

func _lowest_confidence(domains: Array) -> float:
	var lowest := 0.0
	for entry in domains:
		if entry is Dictionary:
			lowest = minf(lowest, float((entry as Dictionary).get("confidenceOffset", 0.0)))
	return lowest

func _heading(text: String, size: int) -> void:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", ThemeManager.get_color_value("text_primary"))
	_column.add_child(label)

func _body(text: String) -> void:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", int(Config.ui("parent_report/body_font_size", 22)))
	label.add_theme_color_override("font_color", ThemeManager.get_color_value("text_dim"))
	_column.add_child(label)
