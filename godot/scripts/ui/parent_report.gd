extends CanvasLayer
## ParentReport — what a parent can see about their child's learning.
##
## PRODUCT.md says parent visibility matters, and after the Godot port there was
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

	var margin: float = Config.ui("parent_report/margin", 48)
	var bar_h: float = Config.ui("parent_report/button_height", 64)

	var scroll := ScrollContainer.new()
	scroll.anchor_right = 1.0
	scroll.anchor_bottom = 1.0
	scroll.offset_left = margin
	# Below the pinned bar, so the report scrolls under a way out that stays put.
	scroll.offset_top = margin + bar_h + Config.ui("parent_report/separation", 12)
	scroll.offset_right = -margin
	scroll.offset_bottom = -margin
	add_child(scroll)

	# THE WAY OUT, PINNED.
	#
	# There was one back button and it was the last child of the scrolling
	# column, under every child's report and the whole flag panel. So on any real
	# family the only way to leave this screen was to scroll past everything to
	# find it, and a parent who opened the report saw no exit at all. It was also
	# a bare Button.new() -- Godot's default flat grey, in a game where every
	# other button is a BrandButton -- so even once found it did not read as a
	# button. "Extremely unclear" was the report, and both halves of that are
	# fixed here: it is a BrandButton, and it is nailed to the top-left corner
	# where it cannot scroll away.
	var pinned := BrandButton.make(TextManager.t("menu.back"), BrandButton.Role.SECONDARY,
		func() -> void:
			closed.emit()
			queue_free())
	pinned.custom_minimum_size = Vector2(Config.ui("parent_report/button_width", 320), bar_h)
	pinned.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	pinned.position = Vector2(margin, margin)
	add_child(pinned)

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

	_render_flag_panel()

	# Kept as well as the pinned one: a parent who has read to the bottom should
	# not have to travel back up to leave. Same role and same size as the pinned
	# one, so the two read as the same control rather than two different offers.
	var back := BrandButton.make(TextManager.t("menu.back"), BrandButton.Role.SECONDARY,
		func() -> void:
			closed.emit()
			queue_free())
	back.custom_minimum_size = Vector2(
		Config.ui("parent_report/button_width", 320), Config.ui("parent_report/button_height", 64))
	back.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_column.add_child(back)

# ─── The grown-up's toggles ───────────────────────────────
##
## Every open product decision in data/tuning/feature_flags.json, as something a
## grown-up can change and then feel.
##
## HERE and not in the pause menu, which is the other screen with settings on it:
## the pause menu is child-facing, and a five-year-old must not be able to switch
## the maths off. This screen is already the grown-up surface -- it is where the
## learning report lives and where the birth-year backfill is asked for -- so it
## is where a decision about a child belongs.
##
## Deliberately plain. These are questions being asked of a parent, not settings
## being offered to a player: each row is the flag's own name, a toggle, and the
## sentence from the JSON explaining what it changes. No icons, no grouping into
## tabs, nothing that suggests a child should come here and browse.
const FLAG_ROWS: Array = [
	"math/retire_exhausted_domains",
	"math/representation_floor",
	"math/group_tokens_in_fives",
	"input/space_is_sprint",
	"input/sprint_pad_latches",
	"levels/wide_gap_pass",
	"levels/practice_arena_in_grid",
	"death/hold_ms",
]

## The values a non-boolean flag cycles through, in order. A flag absent from
## here is a boolean and cycles true/false.
##
## Data rather than a parse of the current value: `hold_ms` is a duration, and
## inferring "what could this become next" from "what is it now" would mean a
## typo in the JSON silently reduces the list to whatever it happens to be.
const FLAG_CHOICES: Dictionary = {
	"death/hold_ms": [0, 800, 1200, 1800, 2500],
}

func _render_flag_panel() -> void:
	_heading(TextManager.t("report_flags_title"), int(Config.ui("parent_report/child_font_size", 30)))
	_body(TextManager.t("report_flags_intro"))
	for path in FLAG_ROWS:
		_render_flag_row(String(path))

func _render_flag_row(path: String) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", int(Config.ui("parent_report/separation", 12)))

	var toggle := Button.new()
	toggle.custom_minimum_size = Vector2(
		Config.ui("parent_report/flag_button_width", 260),
		Config.ui("parent_report/button_height", 64))
	UiFx.attach_focus_highlight(toggle)
	row.add_child(toggle)

	var reset := Button.new()
	reset.text = TextManager.t("report_flags_reset")
	reset.custom_minimum_size = Vector2(
		Config.ui("parent_report/flag_reset_width", 160),
		Config.ui("parent_report/button_height", 64))
	UiFx.attach_focus_highlight(reset)
	row.add_child(reset)

	_column.add_child(row)

	# The explanation is the `_`-prefixed sibling in the JSON, so the sentence a
	# parent reads and the sentence the next engineer reads are the same string.
	# One place to keep true, and the JSON is where the reasoning already lives.
	var parts := path.split("/")
	var why := String(Config.flag_default("%s/_%s" % [parts[0], parts[1]], ""))
	if why != "":
		_body(why)

	var refresh := func() -> void:
		var value: Variant = Config.flag(path)
		var marker := "*" if Config.has_flag_override(path) else ""
		toggle.text = "%s: %s%s" % [parts[1], _flag_text(value), marker]
		reset.disabled = not Config.has_flag_override(path)

	toggle.pressed.connect(func() -> void:
		Config.set_flag_override(path, _next_flag_value(path))
		refresh.call())
	reset.pressed.connect(func() -> void:
		Config.clear_flag_override(path)
		refresh.call())
	refresh.call()

## The next value in the cycle, starting from whatever is live now.
##
## Falls back to inverting a boolean, so a flag added to the JSON without a
## FLAG_CHOICES entry is still togglable rather than inert.
func _next_flag_value(path: String) -> Variant:
	var current: Variant = Config.flag(path)
	var choices: Variant = FLAG_CHOICES.get(path, null)
	if choices is Array and not (choices as Array).is_empty():
		var list: Array = choices
		var at := list.find(current)
		return list[(at + 1) % list.size()]
	return not bool(current)

func _flag_text(value: Variant) -> String:
	if value is bool:
		return TextManager.t("report_flags_on" if value else "report_flags_off")
	return str(value)

func _render_child(profile: Dictionary) -> void:
	var username := String(profile.get("username", ""))
	_heading(username, int(Config.ui("parent_report/child_font_size", 30)))

	# The cloud report is the truth when it exists: every attempt ever, from
	# every device, grouped by domain and by problem kind. Local data is the
	# fallback and says so — it is this device's recent window, not a lifetime.
	var cloud: Dictionary = await CloudSync.fetch_child_report(profile)
	if not cloud.is_empty():
		_render_cloud_report(profile, cloud)
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
func _render_cloud_report(profile: Dictionary, report: Dictionary) -> void:
	_body(TextManager.t("report_source_cloud"))
	var global_elo: Variant = report.get("globalElo", null)
	if global_elo != null:
		_body(TextManager.t("report_elo_line", [str(int(round(float(global_elo))))]))

	# Icelandic school grade, derived server-side from birth year alone (lög um
	# grunnskóla 91/2008: school starts the calendar year a child turns six).
	# Grade 0 is leikskóli — no formal expectations exist there by design.
	var grade_info: Variant = report.get("grade", null)
	if grade_info is Dictionary:
		var grade := int((grade_info as Dictionary).get("grade", 0))
		var born := str(int((grade_info as Dictionary).get("birthYear", 0)))
		if grade <= 0:
			_body(TextManager.t("report_grade_leikskoli", [born]))
		else:
			_body(TextManager.t("report_grade_line", [str(grade), born]))
	else:
		_render_birth_year_prompt(profile)

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
		_render_expectation(d.get("expectation", null))

## The grade verdict for one domain: where this child's ladder position sits
## against Icelandic grade-level material (bands, never points — Iceland sets
## no within-year pacing; docs/GRADE_EXPECTATIONS.md). Wording is deliberate:
## "practice together" is a nudge, never a failure, and it is the only amber
## state. Anything not yet expected at this grade is called a head start.
func _render_expectation(expectation: Variant) -> void:
	if not (expectation is Dictionary):
		return
	var e: Dictionary = expectation
	var status := String(e.get("status", ""))
	var ref_grade := str(int(e.get("refGrade", 0)))
	var line := ""
	var color_key := "accuracy_color_good"
	match status:
		"ahead":
			line = TextManager.t("report_exp_ahead", [ref_grade])
		"on_track":
			line = TextManager.t("report_exp_on_track", [ref_grade])
		"practice":
			line = TextManager.t("report_exp_practice", [ref_grade])
			color_key = "accuracy_color_ok"
		"not_expected_yet":
			line = TextManager.t("report_exp_not_expected", [ref_grade])
		_:
			return
	var label := Label.new()
	label.text = line
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", int(Config.ui("parent_report/body_font_size", 22)))
	label.add_theme_color_override("font_color",
		Color.html(String(Config.ui("parent_report/" + color_key, "#2e9e4f"))))
	_column.add_child(label)
	var cap: Variant = e.get("scopeCappedAtGrade", null)
	if cap != null:
		_body(TextManager.t("report_exp_scope_cap", [str(int(cap))]))

## No birth year on the server child yet: offer the backfill right here, where
## the parent already is. Year only — a full birth date would add nothing (the
## Icelandic grade rule uses the calendar year) and is data we refuse to hold.
func _render_birth_year_prompt(profile: Dictionary) -> void:
	_body(TextManager.t("report_birth_year_prompt"))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", int(Config.ui("parent_report/separation", 12)))
	var year_edit := LineEdit.new()
	year_edit.placeholder_text = TextManager.t("login.birth_year_placeholder")
	year_edit.max_length = 4
	year_edit.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_NUMBER
	year_edit.custom_minimum_size = Vector2(
		Config.ui("parent_report/birth_year_field_width", 160),
		Config.ui("parent_report/button_height", 64))
	row.add_child(year_edit)
	var save := Button.new()
	save.text = TextManager.t("report_birth_year_save")
	save.custom_minimum_size = Vector2(
		Config.ui("parent_report/birth_year_button_width", 180),
		Config.ui("parent_report/button_height", 64))
	var status := Label.new()
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.add_theme_font_size_override("font_size", int(Config.ui("parent_report/body_font_size", 22)))
	status.add_theme_color_override("font_color", ThemeManager.get_color_value("text_dim"))
	save.pressed.connect(func() -> void:
		var year := year_edit.text.strip_edges().to_int()
		var this_year: int = Time.get_datetime_dict_from_system().get("year", 0)
		if year < this_year - 17 or year > this_year:
			status.text = TextManager.t("login.birth_year_invalid")
			return
		save.disabled = true
		var ok: bool = await CloudSync.push_birth_year(profile, year)
		status.text = TextManager.t("report_birth_year_saved" if ok else "report_birth_year_failed")
		save.disabled = not ok)
	UiFx.attach_focus_highlight(save)
	row.add_child(save)
	_column.add_child(row)
	_column.add_child(status)

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
