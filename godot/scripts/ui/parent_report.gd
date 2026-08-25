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
			# Awaited so children render in order and the back button stays last
			# in the column even when a cloud fetch is in flight.
			await _render_child(profile)

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

	# The cloud report is the truth when it exists: every attempt ever, from
	# every device, grouped by domain and by problem kind. Local data is the
	# fallback and says so — it is this device's recent window, not a lifetime.
	var cloud: Dictionary = await CloudSync.fetch_child_report(profile)
	if not cloud.is_empty():
		_render_cloud_report(cloud)
		return

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

	_body(TextManager.t("report_source_local"))
	for entry in domains:
		if not (entry is Dictionary):
			continue
		var d: Dictionary = entry
		# Locked domains are noise for a parent: the child has not met them yet.
		if not bool(d.get("unlocked", false)):
			continue
		var accuracy := float(d.get("firstAttemptAccuracy", 0.0))
		_stat_line(TextManager.t("report_domain_line", [
			TextManager.t("domain_" + String(d.get("domain", ""))),
			str(int(d.get("currentStep", 0))),
			str(int(round(accuracy * 100.0))),
			str(int(d.get("activeReviewCount", 0))),
		]), accuracy)

	# Confidence is the number that explains behaviour a parent actually notices —
	# a child who has hit a rough patch gets easier questions on purpose.
	var conf := _lowest_confidence(domains)
	if conf < 0.0:
		_body(TextManager.t("report_confidence_low"))

## The lifetime matrix: per domain a header with step and skill score, then one
## colour-coded line per problem kind (straight math / word problems / counting
## pictures) with counts — a parent sees where to help at a glance.
func _render_cloud_report(report: Dictionary) -> void:
	_body(TextManager.t("report_source_cloud"))
	var global_elo: Variant = report.get("globalElo", null)
	if global_elo != null:
		_body(TextManager.t("report_elo_line", [str(int(round(float(global_elo))))]))

	for entry in report.get("domains", []):
		if not (entry is Dictionary):
			continue
		var d: Dictionary = entry
		if int(d.get("attempted", 0)) <= 0:
			continue
		var progress: Variant = d.get("progress", null)
		var step := 0
		var highest := 0
		if progress is Dictionary:
			step = int((progress as Dictionary).get("currentStep", 0))
			highest = int((progress as Dictionary).get("highestStep", 0))
		_heading(TextManager.t("report_domain_head", [
			TextManager.t("domain_" + String(d.get("domain", ""))),
			str(step), str(maxi(step, highest)),
		]), int(Config.ui("parent_report/domain_font_size", 24)))

		for kind_entry in d.get("kinds", []):
			if not (kind_entry is Dictionary):
				continue
			var k: Dictionary = kind_entry
			var attempted := int(k.get("attempted", 0))
			if attempted <= 0:
				continue
			var correct := int(k.get("correct", 0))
			var accuracy := float(correct) / attempted
			_stat_line(TextManager.t("report_kind_line", [
				TextManager.t("kind_" + String(k.get("kind", "equation"))),
				str(correct), str(attempted), str(int(round(accuracy * 100.0))),
			]), accuracy)

		var domain_attempted := int(d.get("attempted", 0))
		var domain_correct := int(d.get("correct", 0))
		_stat_line(TextManager.t("report_domain_total", [
			str(domain_correct), str(domain_attempted),
			str(int(round(100.0 * domain_correct / domain_attempted))),
		]), float(domain_correct) / domain_attempted)

## A body line whose colour says how it is going: green comfortably right,
## amber in the working zone, red where a parent's help lands best. The
## thresholds and hexes are data (ui_tuning parent_report), not code.
func _stat_line(text: String, accuracy: float) -> void:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", int(Config.ui("parent_report/body_font_size", 22)))
	var color_hex: String
	if accuracy >= float(Config.ui("parent_report/accuracy_good_min", 0.85)):
		color_hex = String(Config.ui("parent_report/accuracy_color_good", "#2e9e4f"))
	elif accuracy >= float(Config.ui("parent_report/accuracy_ok_min", 0.70)):
		color_hex = String(Config.ui("parent_report/accuracy_color_ok", "#c98500"))
	else:
		color_hex = String(Config.ui("parent_report/accuracy_color_low", "#d05353"))
	label.add_theme_color_override("font_color", Color.html(color_hex))
	_column.add_child(label)

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
