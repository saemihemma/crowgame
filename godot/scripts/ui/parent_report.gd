extends CanvasLayer
## ParentReport — what a parent can see about their child's learning.
##
## PRODUCT.md says parent visibility matters, and after the Godot port there was
## no way to get it: admin.html reads browser localStorage, while the game stores
## everything in user://crow_localstorage.json (IndexedDB on the web). Same key
## names, different storage engine — so the old page could not see this game's
## data at all. This replaces it in-engine, where the data actually lives.
##
## WHAT WAS WRONG WITH THE FIRST VERSION OF THIS SCREEN, because the shape below
## is the answer to it. It was one endless scrolling column: a title, a paragraph,
## then every child's whole report as coloured text lines, then the grown-up
## settings panel, then a back button. The owner's verdict was that it should be
## "a dashboard for a parent to find out what's up for his kid — how is he
## performing, at what ELO, where his errors lie — both a log per problem but
## also stats presented in a way that allows for analysis", and that the UI
## around it was horrible.
##
## Three things follow from that, and they are the three changes here:
##
##  1. A DASHBOARD HAS A TOP LINE. The numbers a parent came for -- skill score,
##     how much has been answered, how much of it right first go, when they last
##     played -- are four tiles at the top, not sentences to find in a column.
##
##  2. COMPARISON, NOT PERCENTAGES. "Good in pluses, struggles in minuses" is a
##     comparison between subjects, and eight percentages in a column is the one
##     presentation that makes comparison hard. Each subject is a bar now
##     (StatBar), sorted so the weakest is FIRST -- a parent opening this screen
##     is looking for where to help, and it should be the top row.
##
##  3. THE LOG IS ITS OWN PLACE. "A log per problem" is a different question from
##     "how is it going" and does not belong interleaved with it, so the screen
##     is three tabs: the overview, every question, and the grown-up settings
##     that used to sit in the middle of the report.
##
## Reads local profile saves, so it works with no network and no account. The
## per-question log rides in the save (SaveManager.record_math_attempt), so it
## follows a child to another device the same way the rest of their progress
## does; the cloud report is still the truth for the lifetime aggregates.

signal closed

enum Tab { OVERVIEW, LOG, SETTINGS }

## Which subjects to show at all. A domain the child has never met is not a
## weakness, and a report that lists eight subjects at 0% for a five-year-old on
## their second day is telling a parent something false.
const MIN_ATTEMPTS_TO_SHOW := 1

var _column: VBoxContainer
var _scroll: ScrollContainer
var _tab_row: HBoxContainer
## Everything except the shade. Held as one node so switching child rebuilds the
## whole screen in one move -- see _next_child.
var _frame: Control
var _tab: Tab = Tab.OVERVIEW
var _profiles: Array = []
var _child: int = 0
## username -> cloud report (an empty dictionary means "asked, nothing there").
## Cached so switching tabs does not re-hit the network, and so the screen is
## instant after the first paint.
var _cloud: Dictionary = {}

func _ready() -> void:
	layer = int(Config.ui("parent_report/layer", 21))
	var shade := ColorRect.new()
	shade.color = ThemeManager.get_color_value("overlay_shade")
	shade.anchor_right = 1.0
	shade.anchor_bottom = 1.0
	add_child(shade)

	_profiles = ProfileManager.get_profiles()
	# Open on whoever is playing, not on whoever is first alphabetically.
	var active = ProfileManager.get_active_user()
	if active != null:
		for i in _profiles.size():
			if String((_profiles[i] as Dictionary).get("username", "")) == String(active):
				_child = i
				break

	await _rebuild()


# ─── The frame: a way out, who this is about, and which question you are asking ──

const BAR_TOP := 10.0
const BACK_WIDTH := 160.0
const TAB_WIDTH := 210.0
## THE ROW HEIGHT NOTHING HERE GETS TO CHOOSE.
##
## BrandButton._ready() raises custom_minimum_size.y to MIN_HEIGHT on every
## button in the game -- Gate B3, nothing tappable smaller than 88px on its short
## edge. This screen asked for 64 from ui_tuning and got 88 anyway, so the top bar
## and the tab strip were each 24px taller than the offsets reserved for them and
## drew straight through the row below: the tabs sat on top of the headline tiles
## and on top of the first line of every tab's content. Photographed by the
## screen tour, which is what it is for.
##
## So the layout is computed from the floor rather than from a wish. The tuning
## key stays for the plain Buttons in the settings tab, which are NOT BrandButtons
## and do honour it.
const ROW_HEIGHT := BrandButton.MIN_HEIGHT
const TAB_HEIGHT := BrandButton.MIN_HEIGHT

func _rebuild() -> void:
	if _frame != null and is_instance_valid(_frame):
		remove_child(_frame)
		_frame.queue_free()
	_frame = Control.new()
	_frame.set_anchors_preset(Control.PRESET_FULL_RECT)
	# The frame positions; it must not swallow a press meant for what it holds.
	_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# The theme every control inside inherits. The shade behind it is a bare
	# ColorRect, so without this the tiles and the flag buttons are Godot's own
	# grey defaults on a game that has a look.
	BrandTheme.apply(_frame)
	add_child(_frame)
	_build_chrome()
	await _show_tab(_tab)

func _build_chrome() -> void:
	var margin: float = Config.ui("parent_report/margin", 48)
	var bar_h := ROW_HEIGHT

	# THE WAY OUT, PINNED.
	#
	# There was one back button and it was the last child of the scrolling
	# column, under every child's report and the whole settings panel. So on any
	# real family the only way to leave this screen was to scroll past everything
	# to find it, and a parent who opened the report saw no exit at all. It was
	# also a bare Button.new() -- Godot's default flat grey, in a game where
	# every other button is a BrandButton -- so even once found it did not read
	# as a button.
	#
	# Nailed to the top-left corner, where a back control belongs and where it
	# cannot scroll away, and no wider than it needs to be: at 320px it was the
	# largest thing on a screen whose subject is somebody's child.
	var back := BrandButton.make(TextManager.t("menu.back"), BrandButton.Role.SECONDARY, _close)
	back.custom_minimum_size = Vector2(BACK_WIDTH, bar_h)
	back.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	back.position = Vector2(margin, BAR_TOP)
	_frame.add_child(back)

	# WHOSE REPORT THIS IS, at the top and always visible. The same reason the
	# progress screen carries the player's name: this game lives on a shared
	# family tablet, and a screen full of numbers about an unnamed child is a
	# screen a parent can misread completely.
	var who := Label.new()
	who.text = _child_name()
	who.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	who.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	who.add_theme_font_size_override("font_size", int(Config.ui("parent_report/title_font_size", 40)))
	who.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	who.set_anchors_preset(Control.PRESET_TOP_WIDE)
	who.offset_left = margin + BACK_WIDTH + 12.0
	who.offset_right = -(margin + BACK_WIDTH + 12.0)
	who.offset_top = BAR_TOP
	who.offset_bottom = BAR_TOP + bar_h
	_frame.add_child(who)

	# Only when there is a choice to make. One child is the common case and a
	# picker with one option in it is furniture.
	if _profiles.size() > 1:
		var picker := BrandButton.make(TextManager.t("report_next_child"),
			BrandButton.Role.GHOST, _next_child)
		picker.custom_minimum_size = Vector2(BACK_WIDTH, bar_h)
		picker.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
		picker.position = Vector2(-margin - BACK_WIDTH, BAR_TOP)
		_frame.add_child(picker)

	_tab_row = HBoxContainer.new()
	_tab_row.alignment = BoxContainer.ALIGNMENT_CENTER
	_tab_row.add_theme_constant_override("separation", 10)
	_tab_row.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_tab_row.offset_top = BAR_TOP + bar_h + 8.0
	_tab_row.offset_bottom = BAR_TOP + bar_h + 8.0 + TAB_HEIGHT
	_frame.add_child(_tab_row)

	_scroll = ScrollContainer.new()
	_scroll.anchor_right = 1.0
	_scroll.anchor_bottom = 1.0
	_scroll.offset_left = margin
	_scroll.offset_right = -margin
	_scroll.offset_top = _tab_row.offset_bottom + 10.0
	_scroll.offset_bottom = -16.0
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_frame.add_child(_scroll)

	_column = VBoxContainer.new()
	_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_column.add_theme_constant_override("separation",
		int(Config.ui("parent_report/separation", 12)))
	_scroll.add_child(_column)

## The tab strip, rebuilt on every switch so the selected one can look selected.
##
## PRIMARY for the tab you are on and SECONDARY for the others, which is the same
## "exactly one primary per screen" rule every other screen here follows -- and
## it means the current tab is legible without a colour a colour-blind parent
## cannot see, because it is also the only one that is filled.
func _build_tabs() -> void:
	_empty(_tab_row)
	var tabs := [
		[Tab.OVERVIEW, "report_tab_overview"],
		[Tab.LOG, "report_tab_log"],
		[Tab.SETTINGS, "report_tab_settings"],
	]
	for entry in tabs:
		var which: Tab = entry[0]
		var role: int = BrandButton.Role.PRIMARY if which == _tab else BrandButton.Role.SECONDARY
		var button := BrandButton.make(TextManager.t(String(entry[1])), role,
			func() -> void: _show_tab(which))
		# The tab strip is navigation, so its rows are shorter than the game's
		# 88px action floor and never pulse -- a row of three breathing buttons
		# would be a fairground, which is what BrandButton's own note warns about.
		button.pulse = false
		button.custom_minimum_size = Vector2(TAB_WIDTH, TAB_HEIGHT)
		_tab_row.add_child(button)

func _show_tab(which: Tab) -> void:
	_tab = which
	_build_tabs()
	_empty(_column)
	_scroll.scroll_vertical = 0
	match which:
		Tab.OVERVIEW:
			await _render_overview()
		Tab.LOG:
			_render_log()
		Tab.SETTINGS:
			_render_settings()

## Rebuilt rather than patched: the name in the top bar, the tiles, the bars and
## the log are all about ONE child, and a partial refresh is exactly how a screen
## ends up showing one child's name over another child's numbers. Which tab you
## were on is kept -- a parent comparing two children is comparing the same
## thing about each of them.
## REMOVED, then freed. queue_free() alone only schedules the node: it stays in
## the tree until the end of the frame, so a container emptied that way lays out
## the old rows AND the new ones together for one frame. On the tab strip that is
## six buttons in a row of three, visibly, every time a tab is pressed.
static func _empty(container: Node) -> void:
	for child in container.get_children():
		container.remove_child(child)
		child.queue_free()

func _next_child() -> void:
	_child = (_child + 1) % maxi(1, _profiles.size())
	_rebuild()

func _close() -> void:
	closed.emit()
	queue_free()

func _profile() -> Dictionary:
	if _child < 0 or _child >= _profiles.size():
		return {}
	return _profiles[_child] as Dictionary

func _child_name() -> String:
	if _profiles.is_empty():
		return TextManager.t("report_title")
	return String(_profile().get("username", ""))


# ─── Tab one: how is it going ──────────────────────────

func _render_overview() -> void:
	if _profiles.is_empty():
		_body(TextManager.t("report_no_children"))
		return
	var profile := _profile()
	var username := String(profile.get("username", ""))
	if not _cloud.has(username):
		_cloud[username] = await CloudSync.fetch_child_report(profile)
	var cloud: Dictionary = _cloud[username]
	var save := _save_of(profile)

	_tiles(cloud, save)

	# THE BARS ARE THE SCREEN, so nothing gets between them and the tiles that a
	# parent does not need first. Both of the lines that used to sit here -- where
	# the numbers came from, and how to read a bar -- were body-sized paragraphs,
	# and together they pushed every bar below the fold on a 540-tall display.
	# The reading note is a caption now and the provenance line has moved down to
	# the footnotes, where a question nobody asks first belongs.
	var subjects := _subjects(cloud, save)
	if subjects.is_empty():
		_body(TextManager.t("report_not_played_yet"))
	else:
		_heading(TextManager.t("report_subjects_title"),
			int(Config.ui("parent_report/child_font_size", 30)))
		_caption(TextManager.t("report_subjects_intro"))
		for subject in subjects:
			_render_subject(subject as Dictionary)

	if not cloud.is_empty() and cloud.get("grade", null) == null:
		_render_birth_year_prompt(profile)
	elif cloud.get("grade", null) is Dictionary:
		_render_grade(cloud["grade"])

	_caption(TextManager.t("report_source_cloud" if not cloud.is_empty() else "report_source_local"))
	_body(TextManager.t("report_what_this_is"))

## One subject: the bar, where the child has got to in it, how it breaks down by
## the KIND of question, and the grade verdict.
##
## The kinds are the second half of "where his errors lie" and they are a
## genuinely different cut of the same attempts: the same child can be fine at
## "7 - 3 = ?" and lost the moment the same sum is wrapped in a sentence, and a
## subject-level percentage averages those two into a number that describes
## neither. Indented and quieter than the subject bar, because they are a
## breakdown of it and not four more subjects.
func _render_subject(subject: Dictionary) -> void:
	_column.add_child(StatBar.make(
		TextManager.t("domain_" + String(subject["domain"])),
		int(subject["correct"]), int(subject["attempted"]), float(subject["accuracy"])))

	# Which rung of this subject's ladder they are on, and the best they have
	# reached -- a child who is at step 3 having once been at step 6 is having a
	# hard week, and that is not visible in any percentage.
	var progress: Variant = subject.get("progress", null)
	if progress is Dictionary:
		var step := int((progress as Dictionary).get("currentStep", 0))
		var best := maxi(step, int((progress as Dictionary).get("highestStep", 0)))
		# No subject name in it: this line sits directly under a bar that is
		# already labelled with one, and "Counting - Counting level 2" is how the
		# first version of it read.
		_caption(TextManager.t("report_domain_head", [str(step), str(best)]))

	for kind_entry in subject.get("kinds", []):
		var kind: Dictionary = kind_entry
		var attempted := int(kind.get("attempted", 0))
		if attempted <= 0:
			continue
		var bar := StatBar.make(TextManager.t("kind_" + String(kind.get("kind", "equation"))),
			int(kind.get("correct", 0)), attempted, float(kind.get("accuracy", 0.0)))
		bar.indent = KIND_INDENT
		bar.custom_minimum_size.y = StatBar.HEIGHT - 6.0
		_column.add_child(bar)

	# The grade verdict belongs UNDER its own bar, not in a section of its own:
	# it is a sentence about this subject and nothing else.
	_render_expectation(subject.get("expectation", null))

## How far a kind's bar is pushed in from its subject's.
const KIND_INDENT := 28.0

## A quiet line under whatever it is about. Smaller and dimmer than _body, which
## is for sentences the parent is meant to read rather than glance at.
func _caption(text: String) -> void:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size",
		int(Config.ui("parent_report/tile_caption_font_size", 18)))
	label.add_theme_color_override("font_color", ThemeManager.get_color_value("text_dim"))
	_column.add_child(label)

## The four numbers a parent came for.
##
## ELO is here because the owner asked for it by name ("how is he performing, at
## what ELO"). It is deliberately labelled "skill score" and not "ELO": the word
## is jargon from chess ratings, and what it means to a parent is a number that
## goes up.
func _tiles(cloud: Dictionary, save: Dictionary) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", int(Config.ui("parent_report/separation", 12)))
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_column.add_child(row)

	var elo: Variant = cloud.get("globalElo", null)
	if elo == null:
		var stats: Variant = save.get("eloStats", null)
		if stats is Dictionary:
			elo = (stats as Dictionary).get("globalELO", null)
	_tile(row, TextManager.t("report_stat_elo"),
		TextManager.t("report_no_value") if elo == null else str(int(round(float(elo)))))

	var answered := int(cloud.get("totalAttempts", 0))
	if answered == 0:
		var telemetry: Variant = save.get("telemetry", {})
		if telemetry is Dictionary:
			answered = int((telemetry as Dictionary).get("problemsAttempted", 0))
	_tile(row, TextManager.t("report_stat_answered"), str(answered))

	var first := _first_try_rate(cloud, save)
	_tile(row, TextManager.t("report_stat_first_try"),
		TextManager.t("report_no_value") if first < 0.0 else "%d%%" % int(round(first * 100.0)))

	_tile(row, TextManager.t("report_stat_last_played"), _last_played(save))

func _tile(row: HBoxContainer, caption: String, value: String) -> void:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel", _card_face())
	var box := VBoxContainer.new()
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	panel.add_child(box)

	var number := Label.new()
	number.text = value
	number.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	number.add_theme_font_size_override("font_size",
		int(Config.ui("parent_report/tile_value_font_size", 38)))
	number.add_theme_color_override("font_color", ThemeManager.get_color_value("coin"))
	box.add_child(number)

	var label := Label.new()
	label.text = caption
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size",
		int(Config.ui("parent_report/tile_caption_font_size", 18)))
	label.add_theme_color_override("font_color", ThemeManager.get_color_value("text_dim"))
	box.add_child(label)
	row.add_child(panel)

## One row per subject, WEAKEST FIRST.
##
## The order is the argument. A parent opens this screen to find out where to
## help, so the subject that needs help is the first thing under the heading and
## the strongest one is at the bottom -- the opposite of the old report, which
## sorted by how much had been answered and so led with whatever the child had
## been doing most of.
##
## Subjects with too few answers to mean anything sort to the END regardless of
## their percentage, because two questions right is not a strength and two
## questions wrong is not a weakness, and either one at the top of this list
## would send a parent to the wrong place.
func _subjects(cloud: Dictionary, save: Dictionary) -> Array:
	var rows: Array = []
	if not cloud.is_empty():
		for entry in cloud.get("domains", []):
			if not (entry is Dictionary):
				continue
			var d: Dictionary = entry
			var attempted := int(d.get("attempted", 0))
			if attempted < MIN_ATTEMPTS_TO_SHOW:
				continue
			var first: Variant = d.get("firstTryAccuracy", null)
			# RIGHT FIRST GO, on both halves of the bar. The report sends the rate
			# and the all-attempts count separately, and feeding one to the
			# percentage and the other to the tally put "100% - 1/1" next to a
			# headline tile reading 0% -- both true, and side by side they read as
			# a contradiction. So the sample is derived from the rate it belongs
			# to, the same weighting the headline does.
			var first_right := 0 if first == null else int(round(float(first) * attempted))
			var kinds: Array = []
			for kind_entry in d.get("kinds", []):
				if not (kind_entry is Dictionary):
					continue
				var k: Dictionary = kind_entry
				var kind_tried := int(k.get("attempted", 0))
				if kind_tried <= 0:
					continue
				# The kind bars show ACCURACY and not first-try accuracy: a kind
				# can carry too few first attempts for that number to exist at
				# all, and a bar that vanishes for one of three kinds reads as
				# "never asked" rather than "not enough to say".
				kinds.append({
					"kind": String(k.get("kind", "equation")),
					"attempted": kind_tried, "correct": int(k.get("correct", 0)),
					"accuracy": float(k.get("accuracy", 0.0)),
				})
			rows.append({
				"domain": String(d.get("domain", "")),
				"attempted": attempted,
				"correct": first_right,
				"accuracy": -1.0 if first == null else float(first),
				"expectation": d.get("expectation", null),
				"progress": d.get("progress", null),
				"kinds": kinds,
			})
	else:
		for domain in _local_tallies(save):
			rows.append(domain)
	rows.sort_custom(func(a, b) -> bool:
		var thin_a: bool = float(a["accuracy"]) < 0.0
		var thin_b: bool = float(b["accuracy"]) < 0.0
		if thin_a != thin_b:
			return thin_b
		return float(a["accuracy"]) < float(b["accuracy"]))
	return rows

## The same rows from this device alone, for a family with no server behind them.
##
## Built from the per-question log rather than from `mathStats`, which is keyed by
## SKILL and not by subject -- there is no way back from "basic_addition,
## bridge_ten" to "Adding" that does not restate the curriculum's own mapping in
## a second place.
func _local_tallies(save: Dictionary) -> Array:
	var by_domain: Dictionary = {}
	for entry in _log_of(save):
		var row: Dictionary = entry
		var domain := String(row.get("domain", ""))
		if domain.is_empty():
			continue
		var tally: Dictionary = by_domain.get(domain, {"attempted": 0, "correct": 0})
		tally["attempted"] = int(tally["attempted"]) + 1
		# Right FIRST GO, matching the cloud path and matching what the bar says
		# it means. Plain accuracy here would make an offline bar and an online
		# bar of the same play two different numbers.
		if bool(row.get("correct", false)) and bool(row.get("firstTry", false)):
			tally["correct"] = int(tally["correct"]) + 1
		by_domain[domain] = tally
	var rows: Array = []
	for domain in by_domain:
		var tally: Dictionary = by_domain[domain]
		var attempted := int(tally["attempted"])
		# No kinds and no expectation on this path: the problem catalog that maps
		# a question to its kind is generated server-side, and the grade verdict
		# needs a birth year the server holds. Offline this screen shows what the
		# device can honestly answer, and nothing shaped like a gap.
		rows.append({
			"domain": domain, "attempted": attempted, "correct": int(tally["correct"]),
			"accuracy": float(tally["correct"]) / attempted, "expectation": null,
			"progress": _local_progress(save, domain), "kinds": [],
		})
	return rows

## Where this child has got to in one subject, from their own save.
##
## The cloud report computes this from the same `learnerState.curriculumProgress`
## blob it was sent, so offline and online say the same thing about the rung --
## only the attempt totals differ (this device, versus every device).
func _local_progress(save: Dictionary, domain: String) -> Variant:
	var learner: Variant = save.get("learnerState", null)
	if not (learner is Dictionary):
		return null
	var curriculum: Variant = (learner as Dictionary).get("curriculumProgress", {})
	if not (curriculum is Dictionary):
		return null
	var entry: Variant = (curriculum as Dictionary).get(domain, null)
	return entry if entry is Dictionary else null

## Right first go, across everything. The number the ladder is actually steering
## by, and the one that says whether the game is pitching questions well: a child
## sitting near 75-80% is being asked things at the edge of what they can do,
## which is where the practice is worth anything.
func _first_try_rate(cloud: Dictionary, save: Dictionary) -> float:
	var tried := 0
	var right := 0
	if not cloud.is_empty():
		for entry in cloud.get("domains", []):
			if not (entry is Dictionary):
				continue
			var d: Dictionary = entry
			var rate: Variant = d.get("firstTryAccuracy", null)
			if rate == null:
				continue
			# The report sends the rate and not the counts, so weight by how much
			# of the subject there is -- an unweighted mean of eight percentages
			# lets one three-question subject swing the headline.
			var attempted := int(d.get("attempted", 0))
			tried += attempted
			right += int(round(float(rate) * attempted))
	else:
		for entry in _log_of(save):
			tried += 1
			if bool((entry as Dictionary).get("firstTry", false)) \
					and bool((entry as Dictionary).get("correct", false)):
				right += 1
	return -1.0 if tried == 0 else float(right) / tried

func _last_played(save: Dictionary) -> String:
	var log := _log_of(save)
	if log.is_empty():
		return TextManager.t("report_no_value")
	return _when(int((log[log.size() - 1] as Dictionary).get("at", 0)))

func _render_grade(grade_info: Dictionary) -> void:
	# Icelandic school grade, derived server-side from birth year alone (lög um
	# grunnskóla 91/2008: school starts the calendar year a child turns six).
	# Grade 0 is leikskóli — no formal expectations exist there by design.
	var grade := int(grade_info.get("grade", 0))
	var born := str(int(grade_info.get("birthYear", 0)))
	if grade <= 0:
		_body(TextManager.t("report_grade_leikskoli", [born]))
	else:
		_body(TextManager.t("report_grade_line", [str(grade), born]))


# ─── Tab two: every question ───────────────────────────

## The log the owner asked for: what was actually asked, and how it went.
##
## A percentage tells a parent that a rough patch exists. This tells them what it
## was made of -- and it is the difference between "63% in Taking away" and
## "four twelve-minus-something questions in a row, all wrong, on Tuesday". Only
## the second one can be sat down with.
##
## Newest first, because the question a parent has is about this afternoon.
func _render_log() -> void:
	if _profiles.is_empty():
		_body(TextManager.t("report_no_children"))
		return
	var log := _log_of(_save_of(_profile()))
	if log.is_empty():
		_body(TextManager.t("report_log_empty"))
		return
	_body(TextManager.tp("report_log_intro", {"n": log.size()}, "n"))
	for entry in newest_first(log):
		_column.add_child(_log_row(entry as Dictionary))

## The log as a parent reads it. The save appends, so the store's order is oldest
## first and this is the one place it is turned round.
static func newest_first(log: Array) -> Array:
	var out: Array = []
	for i in range(log.size() - 1, -1, -1):
		out.append(log[i])
	return out

const LOG_ROW_HEIGHT := 54.0
const LOG_MARK_SIZE := 30.0

func _log_row(entry: Dictionary) -> Control:
	var correct := bool(entry.get("correct", false))
	var panel := PanelContainer.new()
	panel.custom_minimum_size.y = LOG_ROW_HEIGHT
	panel.add_theme_stylebox_override("panel", _log_face(correct))
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", int(Config.ui("parent_report/separation", 12)))
	panel.add_child(line)

	# The verdict as a mark, not a word: it is the thing being scanned for down
	# the column, and a column of ticks and crosses is scannable in a way that a
	# column of "right"/"wrong" is not -- and it is scannable in both languages
	# without being translated.
	line.add_child(VerdictMark.make(correct, LOG_MARK_SIZE))

	var question := Label.new()
	question.text = _question_text(entry)
	question.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	question.clip_text = true
	question.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	question.add_theme_font_size_override("font_size",
		int(Config.ui("parent_report/body_font_size", 22)))
	question.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	line.add_child(question)

	# How it was got, which is the part a bare right/wrong hides: right after two
	# hints and right first go are not the same answer, and the ladder treats
	# them differently.
	var how := Label.new()
	how.text = _how_it_went(entry)
	how.custom_minimum_size.x = 210.0
	how.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	how.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	how.add_theme_font_size_override("font_size",
		int(Config.ui("parent_report/tile_caption_font_size", 18)))
	how.add_theme_color_override("font_color", ThemeManager.get_color_value("text_dim"))
	line.add_child(how)

	var when := Label.new()
	when.text = _when(int(entry.get("at", 0)))
	when.custom_minimum_size.x = 130.0
	when.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	when.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	when.add_theme_font_size_override("font_size",
		int(Config.ui("parent_report/tile_caption_font_size", 18)))
	when.add_theme_color_override("font_color", ThemeManager.get_color_value("text_dim"))
	line.add_child(when)
	return panel

## The question as the child saw it, in the family's language.
##
## Through MathPhrasing, the same overlay the maths board renders with, so a
## parent reading Icelandic sees the Icelandic sentence rather than the canonical
## English the pools store. A problem that has since left the pools falls back to
## its subject -- the log entry is still worth something, and a raw id is not.
func _question_text(entry: Dictionary) -> String:
	var problem: Variant = MathProblemManager.find_problem(String(entry.get("id", "")))
	if problem is Dictionary:
		var text := MathPhrasing.localise(problem as Dictionary, "prompt")
		if not text.is_empty():
			# A COUNTING QUESTION IS HALF PICTURE. Its prompt carries a run of
			# marker characters that the board replaces with drawn tokens, so
			# printed raw it reaches a parent as "How many rings? @ @ @ @ @".
			# The caption is the readable half and the count is the rest of the
			# question -- without it, every counting question in the log is the
			# same sentence.
			var tokens := CountRow.tokens_in(text)
			if tokens > 0:
				return TextManager.t("report_log_count_of",
					[CountRow.caption_in(text), str(tokens)])
			return text
	var domain := String(entry.get("domain", ""))
	return TextManager.t("domain_" + domain) if not domain.is_empty() \
		else TextManager.t("report_log_unknown_question")

func _how_it_went(entry: Dictionary) -> String:
	var seconds := int(round(float(entry.get("ms", 0)) / 1000.0))
	var hints := int(entry.get("hints", 0))
	if hints > 0:
		return TextManager.tp("report_log_with_help",
			{"n": hints, "s": seconds}, "n")
	if bool(entry.get("firstTry", false)):
		return TextManager.t("report_log_first_try", [str(seconds)])
	return TextManager.t("report_log_retry", [str(seconds)])

## Days, not clock times.
##
## A parent asks "was this today or last week", never "was this 16:42". Relative
## days also sidestep a real problem with clock times here: the log is written
## with the device's own clock, and a child who plays on a tablet in one timezone
## and a laptop in another would otherwise get a list that appears to jump about.
func _when(at_ms: int) -> String:
	if at_ms <= 0:
		return TextManager.t("report_no_value")
	var day := 86400
	var now := int(Time.get_unix_time_from_system())
	var days := int(floor(float(now - at_ms / 1000) / day))
	if days <= 0:
		return TextManager.t("report_when_today")
	if days == 1:
		return TextManager.t("report_when_yesterday")
	return TextManager.t("report_when_days_ago", [str(days)])

## The ink card every panel on this screen sits on. One place, so a tile and a
## log row are visibly the same material.
func _card_face() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(ThemeManager.get_color_value("ink"), 0.72)
	box.set_corner_radius_all(10)
	box.content_margin_left = 14
	box.content_margin_right = 14
	box.content_margin_top = 10
	box.content_margin_bottom = 10
	return box

func _log_face(correct: bool) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	var ink: Color = ThemeManager.get_color_value("ink")
	box.bg_color = Color(ink, 0.72)
	box.set_corner_radius_all(10)
	# A hairline of the verdict colour down the left edge, so the outcome is
	# readable from the shape of the column even before the marks are read.
	box.border_width_left = 6
	box.border_color = StatBar.colour_for(1.0 if correct else 0.0)
	box.content_margin_left = 14
	box.content_margin_right = 14
	box.content_margin_top = 6
	box.content_margin_bottom = 6
	return box


# ─── Tab three: the grown-up's toggles ─────────────────
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
## In a TAB of its own now rather than appended to the report. It used to sit
## between the last child's numbers and the back button, so a parent scrolling to
## the end of the report walked through eight product questions to get there.
##
## Deliberately plain. These are questions being asked of a parent, not settings
## being offered to a player: each row is the flag's own name, a toggle, and the
## sentence from the JSON explaining what it changes.
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

func _render_settings() -> void:
	_body(TextManager.t("report_flags_intro"))
	for path in FLAG_ROWS:
		_render_flag_row(String(path))

func _render_flag_row(path: String) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", int(Config.ui("parent_report/separation", 12)))

	var parts := path.split("/")
	var toggle := BrandButton.make("", BrandButton.Role.SECONDARY, Callable())
	toggle.pulse = false
	toggle.custom_minimum_size = Vector2(
		Config.ui("parent_report/flag_button_width", 260), ROW_HEIGHT)
	row.add_child(toggle)

	var reset := BrandButton.make(TextManager.t("report_flags_reset"),
		BrandButton.Role.GHOST, Callable())
	reset.pulse = false
	reset.custom_minimum_size = Vector2(
		Config.ui("parent_report/flag_reset_width", 160), ROW_HEIGHT)
	row.add_child(reset)

	_column.add_child(row)

	# THE FIRST SENTENCE OF the `_`-prefixed sibling in the JSON, and only the
	# first.
	#
	# The whole note used to be printed here, on the reasoning that the sentence a
	# parent reads and the sentence the next engineer reads should be the same
	# string. The screen tour showed what that actually put in front of a parent:
	# "OwlSelection picks the next subject by staleness x weight and has no notion
	# of mastery... Measured on the journey sim: counting tops out at step 6 in
	# every journey and is then served 184/1200 to a thriving child". That is a
	# code comment, and it filled the screen.
	#
	# These notes are written first sentence first -- "When a child has finished a
	# domain's whole ladder, stop offering it" -- so the split costs nothing and
	# the JSON is still the only place the reasoning lives. The rest of it is
	# still there for whoever opens the file.
	var why := String(Config.flag_default("%s/_%s" % [parts[0], parts[1]], ""))
	if why != "":
		_caption(_first_sentence(why))

	var refresh := func() -> void:
		var value: Variant = Config.flag(path)
		var marker := "*" if Config.has_flag_override(path) else ""
		toggle.text = "%s: %s%s" % [_flag_name(String(parts[1])), _flag_text(value), marker]
		reset.disabled = not Config.has_flag_override(path)

	toggle.pressed.connect(func() -> void:
		Config.set_flag_override(path, _next_flag_value(path))
		refresh.call())
	reset.pressed.connect(func() -> void:
		Config.clear_flag_override(path)
		refresh.call())
	refresh.call()

## `retire_exhausted_domains` -> `Retire exhausted domains`. Still the flag's own
## name, because a parent changing one and a developer reading the JSON have to
## be able to talk about the same row -- but not shouted in snake_case at
## somebody who has never opened the file.
static func _flag_name(identifier: String) -> String:
	var words := identifier.replace("_", " ")
	return words.substr(0, 1).to_upper() + words.substr(1)

## Up to and including the first full stop. A note with no full stop is one
## sentence already.
static func _first_sentence(text: String) -> String:
	var stop := text.find(". ")
	return text if stop < 0 else text.substr(0, stop + 1)

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


# ─── Shared bits ───────────────────────────────────────

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
	var ratio := 1.0
	match status:
		"ahead":
			line = TextManager.t("report_exp_ahead", [ref_grade])
		"on_track":
			line = TextManager.t("report_exp_on_track", [ref_grade])
		"practice":
			line = TextManager.t("report_exp_practice", [ref_grade])
			ratio = 0.75
		"not_expected_yet":
			line = TextManager.t("report_exp_not_expected", [ref_grade])
		_:
			return
	var label := Label.new()
	label.text = line
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size",
		int(Config.ui("parent_report/tile_caption_font_size", 18)))
	label.add_theme_color_override("font_color", StatBar.colour_for(ratio))
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

## One child's save blob, straight from the store.
##
## The same place the cloud sync treats as authoritative, and read per child
## rather than through SaveManager, because this screen is about every child on
## the device and SaveManager only ever holds the one who is playing.
func _save_of(profile: Dictionary) -> Dictionary:
	var raw: Variant = Persistence.get_item(
		ProfileManager.get_save_key_for_user(String(profile.get("username", ""))))
	if raw == null:
		return {}
	var parsed: Variant = JSON.parse_string(String(raw))
	return parsed if parsed is Dictionary else {}

func _log_of(save: Dictionary) -> Array:
	var telemetry: Variant = save.get("telemetry", {})
	if not (telemetry is Dictionary):
		return []
	var log: Variant = (telemetry as Dictionary).get("attemptLog", [])
	return log if log is Array else []

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
