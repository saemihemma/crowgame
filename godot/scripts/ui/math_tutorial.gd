extends CanvasLayer
## MathTutorial — the click-through lesson a child gets the first time a maths
## idea is genuinely new to them.
##
## Four cards, one tap each, in the order the research on novice learners keeps
## landing on (docs/MATH_CONCEPT_LADDER.md):
##
##   see     concrete    the idea as objects, before any symbol
##   model   pictorial   the same idea in the model that carries it (ten-frame,
##                       number line, base-ten rods, equal groups)
##   worked  abstract    the equation, already solved, with the reasoning said
##                       out loud - the worked-example effect
##   try     guided      one question with the same picture still on screen -
##                       faded guidance, and the first thing the child does
##                       rather than watches
##
## That is a FULL lesson, and a child gets one the first time they meet a whole
## domain. Every rung after it inside that domain gets a BRIEF one instead --
## the cards named by tutorial_tuning.json's `brief_cards`, which is the model
## and the worked example, no guided try. Four cards plus a guided question in
## front of every new rung is how forty-seven lessons turn into a child tapping
## Next without reading. See TutorialManager.depth_for().
##
## Then the owl asks the real question. That question is the first thing that
## touches the learner model: NOTHING in here records an attempt, moves a
## curriculum step, or feeds ELO. A child cannot be marked down for a lesson.
##
## Skip is on every card, from the first. Autonomy is not a courtesy here, it is
## load-bearing: a child who cannot leave a lesson learns that the owl talks at
## them, and the next one gets tapped through without reading.
##
## Everything this scene looks like comes from data/tuning/tutorial_tuning.json.
## Everything it says comes from data/i18n/strings_*.json. Everything it teaches
## comes from data/curriculum/tutorials.json. This file is only the flow.

## Fired once, whichever way the lesson ended.
signal closed(payload: Dictionary)

var _tutorial: Dictionary = {}
## The cards this showing will actually play. A full lesson is every authored
## card; a brief one is the subset named by tutorial_tuning.json. Held as its own
## array rather than filtered on every read so `current_index()` and
## `card_count()` mean the same thing to the flow, the dots and the probe.
var _cards: Array = []
var _depth := TutorialManager.DEPTH_FULL
var _index := 0
var _skipped := false
var _done := false
## Set once the guided try has been answered, so the last card's options stop
## accepting taps while the celebration plays.
var _answered := false

var _board: PanelContainer
var _title: Label
var _body: Label
var _visual: TutorialVisual
var _dots: HBoxContainer
var _controls: HBoxContainer
var _next: BrandButton
var _back: BrandButton
var _skip: BrandButton
var _options: Array[AnswerButton] = []

func _ready() -> void:
	TextManager.locale_changed.connect(func(_code): _refresh_text())

## Start the lesson. `tutorial` is one entry from data/curriculum/tutorials.json.
##
## `depth` is TutorialManager.DEPTH_FULL or DEPTH_BRIEF. Full plays all four
## cards; brief plays only the ones named in tutorial_tuning.json's `briefCards`
## -- the model picture and the worked example -- because the child has met this
## domain before and needs reminding how the new rung goes, not teaching from
## objects upward.
func present(tutorial: Dictionary, depth: String = TutorialManager.DEPTH_FULL) -> void:
	_tutorial = tutorial
	_depth = depth
	_cards = _cards_for_depth(tutorial, depth)
	_index = 0
	_skipped = false
	_done = false
	_build()
	_render()

## Which authored cards this depth plays, in the authored order.
##
## Falls back to the whole lesson whenever the brief set would come out empty --
## a mistyped card name in the tuning file should cost a child extra reading,
## never a lesson that opens on nothing and cannot be advanced.
static func _cards_for_depth(tutorial: Dictionary, depth: String) -> Array:
	var cards: Array = tutorial.get("cards", [])
	if depth != TutorialManager.DEPTH_BRIEF:
		return cards
	var wanted: Variant = Config.tutorial("brief_cards", ["model", "worked"])
	if not (wanted is Array) or (wanted as Array).is_empty():
		return cards
	var out: Array = []
	for card in cards:
		if (wanted as Array).has(String((card as Dictionary).get("body", ""))):
			out.append(card)
	return out if not out.is_empty() else cards

## FULL or BRIEF. Public so a probe can assert the rule fired, rather than
## inferring depth from a card count that two different lessons could share.
## Whether the card on screen is still playing its action -- see
## TutorialVisual.is_action_playing().
func visual_is_animating() -> bool:
	return _visual != null and _visual.is_action_playing()

func depth() -> String:
	return _depth

func tutorial_id() -> String:
	return String(_tutorial.get("id", ""))

func card_count() -> int:
	return _cards.size()

## Which card is showing. Public because the flow is the thing worth testing:
## a lesson that silently stops advancing is invisible from the outside.
func current_index() -> int:
	return _index

func is_active() -> bool:
	return not _done

# --- flow -----------------------------------------------------------------

## Forward one card, or finish. On a card with a question this is only reachable
## once the question has been answered, so the child cannot page past the one
## thing they were meant to do.
func advance() -> void:
	if _done:
		return
	if _index + 1 >= card_count():
		_finish(false)
		return
	_index += 1
	_render()

func back() -> void:
	if _done or _index == 0:
		return
	_index -= 1
	_render()

## The child's own way out, available from the first card. Recorded as skipped
## rather than unseen: re-offering a lesson somebody declined would make the
## button a lie, and the flag is what lets a grown-up surface tell the two apart.
func skip() -> void:
	if _done:
		return
	_finish(true)

## Answer the guided try. Wrong taps cost nothing but a nudge - this is the
## lesson, not the test, and the real question is still to come.
func choose(index: int) -> void:
	if _done or _answered:
		return
	var choice: Dictionary = current_card().get("choice", {})
	var options: Array = choice.get("options", [])
	if index < 0 or index >= options.size():
		return
	var correct := str(options[index]) == str(choice.get("correct", null))
	if not correct:
		AudioManager.play_event("answer_wrong")
		_options[index].set_state(AnswerButton.State.WRONG)
		_options[index].shake()
		_options[index].disabled = true
		return
	_answered = true
	AudioManager.play_event("answer_correct")
	_options[index].set_state(AnswerButton.State.RIGHT)
	for b in _options:
		b.disabled = true
	var centre := get_viewport().get_visible_rect().size / 2.0
	DopamineFX.number_fly_up(self, centre - Vector2(0, 120), TextManager.t("tutorial.nice"),
		ThemeManager.get_color_value("accent"))
	get_tree().create_timer(_ms("choice_right_hold_ms", 1000.0)).timeout.connect(
		advance, CONNECT_ONE_SHOT)

func _finish(skipped: bool) -> void:
	if _done:
		return
	_done = true
	_skipped = skipped
	closed.emit({"tutorialId": tutorial_id(), "skipped": _skipped})
	queue_free()

## The card on screen. Public for the same reason current_problem is on the
## maths board: a headless probe drives the real flow, and it needs the guided
## question in order to answer it.
func current_card() -> Dictionary:
	return _cards[_index] if _index >= 0 and _index < _cards.size() else {}

func _ms(key: String, fallback: float) -> float:
	return float(Config.tutorial("pacing/%s" % key, fallback)) / 1000.0

func _layout(key: String, fallback: Variant) -> Variant:
	return Config.tutorial("layout/%s" % key, fallback)

# --- rendering ------------------------------------------------------------

func _build() -> void:
	for child in get_children():
		child.queue_free()

	var dim := ColorRect.new()
	dim.color = ThemeManager.get_color_value("scrim")
	dim.anchor_right = 1.0
	dim.anchor_bottom = 1.0
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(dim)

	var center := CenterContainer.new()
	center.anchor_right = 1.0
	center.anchor_bottom = float(_layout("board_screen_share", 0.86))
	dim.add_child(center)

	_board = PanelContainer.new()
	_board.add_theme_stylebox_override("panel", _board_face())
	_board.custom_minimum_size = Vector2(float(_layout("board_min_w", 620)), 0)
	center.add_child(_board)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", int(_layout("separation", 16)))
	_board.add_child(column)

	# Title and the way out, on one line. Skip sits at the top corner rather than
	# beside Next: it is not a step in the lesson, and it should never be the
	# button a child hits while tapping through.
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", int(_layout("separation", 16)))
	column.add_child(header)

	_title = Label.new()
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_title.add_theme_font_size_override("font_size", int(_layout("title_font_size", 30)))
	_title.add_theme_color_override("font_color",
		ThemeManager.get_color_value(String(Config.tutorial("roles/title", "accent"))))
	header.add_child(_title)

	_skip = BrandButton.new()
	# GHOST, and never PRIMARY: the way out has to be findable without competing
	# with the lesson for a child's eye.
	_skip.role = BrandButton.Role.GHOST
	_skip.custom_minimum_size = Vector2(float(_layout("skip_button_w", 150)), float(_layout("skip_button_h", 56)))
	_skip.add_theme_font_size_override("font_size", int(_layout("skip_font_size", 20)))
	_skip.pressed.connect(skip)
	header.add_child(_skip)

	_dots = HBoxContainer.new()
	_dots.alignment = BoxContainer.ALIGNMENT_CENTER
	_dots.add_theme_constant_override("separation", int(_layout("dot_gap", 10)))
	column.add_child(_dots)

	_visual = TutorialVisual.new()
	_visual.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_child(_visual)

	_body = Label.new()
	_body.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_body.custom_minimum_size = Vector2(float(_layout("body_wrap_width", 540)), float(_layout("body_min_h", 78)))
	_body.add_theme_font_size_override("font_size", int(_layout("body_font_size", 22)))
	_body.add_theme_color_override("font_color",
		ThemeManager.get_color_value(String(Config.tutorial("roles/body", "paper"))))
	column.add_child(_body)

	_controls = HBoxContainer.new()
	_controls.alignment = BoxContainer.ALIGNMENT_CENTER
	_controls.add_theme_constant_override("separation", int(_layout("option_gap", 16)))
	column.add_child(_controls)

	UiFx.elastic_entrance.call_deferred(column)

## Rebuild the parts that change per card. The board, title bar and dots row are
## built once and kept: a card change should read as a page turn, not as the
## whole lesson blinking.
func _render() -> void:
	_answered = false
	var card := current_card()
	_visual.setup(String(card.get("visual", "")), card.get("params", {}))
	_render_dots()
	_render_controls(card)
	_refresh_text()

## One dot per card left to tap. A single-card lesson has none: a lone dot is
## an unexplained mark on a board a child is already reading a question off, and
## it says nothing a Next button has not already said.
func _render_dots() -> void:
	for child in _dots.get_children():
		child.queue_free()
	_dots.visible = card_count() > 1
	if not _dots.visible:
		return
	var accent := ThemeManager.get_color_value(String(Config.tutorial("roles/title", "accent")))
	var diameter := float(_layout("dot_size", 12))
	for i in card_count():
		var dot := Panel.new()
		dot.custom_minimum_size = Vector2(diameter, diameter)
		var style := StyleBoxFlat.new()
		style.set_corner_radius_all(int(diameter * 0.5))
		if i <= _index:
			style.bg_color = accent
		else:
			style.bg_color = Color(0, 0, 0, 0)  # hardcode-ok: fully transparent, not a themed colour
			style.set_border_width_all(int(_layout("dot_border", 2)))
			style.border_color = accent
		dot.add_theme_stylebox_override("panel", style)
		_dots.add_child(dot)

func _render_controls(card: Dictionary) -> void:
	for child in _controls.get_children():
		child.queue_free()
	_options.clear()
	_next = null
	_back = null

	var choice: Dictionary = card.get("choice", {})
	if not choice.is_empty():
		# A card with a question has no Next. The answer IS the way forward, and
		# a Next beside it is an invitation to skip the only active moment in the
		# lesson.
		var options: Array = choice.get("options", [])
		for i in options.size():
			var button := AnswerButton.new()
			button.text = str(options[i])
			button.custom_minimum_size = Vector2(float(_layout("option_min_w", 108)), float(_layout("option_min_h", 84)))
			button.add_theme_font_size_override("font_size", int(_layout("option_font_size", 30)))
			var index := i
			button.pressed.connect(func(): choose(index))
			_controls.add_child(button)
			_options.append(button)
		# NO grab_focus() here, and that is a fix rather than an omission.
		#
		# This called _options[0].grab_focus() on an AnswerButton, whose
		# focus_mode is FOCUS_NONE -- so Godot logged "This control can't grab
		# focus" on every guided-try card that has ever rendered, and the card was
		# unreachable by keyboard entirely: nothing focused, so Enter and Space did
		# nothing. A browser harness driving the game hit it as a hard wall and
		# could not get past the first owl.
		#
		# _unhandled_input below is the keyboard path, by digit, matching the
		# board's.
		return

	_back = BrandButton.new()
	_back.custom_minimum_size = Vector2(float(_layout("nav_button_w", 168)), float(_layout("nav_button_h", 72)))
	_back.add_theme_font_size_override("font_size", int(_layout("nav_font_size", 24)))
	_back.role = BrandButton.Role.GHOST
	_back.disabled = _index == 0
	_back.pressed.connect(back)
	_controls.add_child(_back)

	_next = BrandButton.new()
	# The one thing on the card you are meant to press, so it breathes.
	_next.role = BrandButton.Role.PRIMARY
	_next.pulse = true
	_next.custom_minimum_size = Vector2(float(_layout("nav_button_w", 168)), float(_layout("nav_button_h", 72)))
	_next.add_theme_font_size_override("font_size", int(_layout("nav_font_size", 24)))
	_next.pressed.connect(advance)
	_controls.add_child(_next)
	_next.grab_focus()

## The guided-try card, answerable from the keyboard by position. Same contract
## as the board's: digits only, because they carry no movement meaning.
##
## Only the choice cards take a digit. On a card that has a Next, ui_accept
## already works because BrandButton does take focus -- the FOCUS_NONE problem
## was only ever the AnswerButton options.
func _unhandled_input(event: InputEvent) -> void:
	if _options.is_empty():
		return
	for i in mini(_options.size(), 4):
		if not event.is_action_pressed("answer_%d" % (i + 1)):
			continue
		if _options[i].disabled:
			get_viewport().set_input_as_handled()
			return
		choose(i)
		get_viewport().set_input_as_handled()
		return

## Every string on the card, in the active locale. Split out from _render so a
## language change mid-lesson re-letters the card in place instead of restarting
## it - a child who switches language should not lose their place.
func _refresh_text() -> void:
	if _title == null:
		return
	var id := tutorial_id()
	_title.text = TextManager.t("tutorial.%s.title" % id)
	_body.text = TextManager.t("tutorial.%s.%s" % [id, String(current_card().get("body", ""))])
	_skip.text = TextManager.t("tutorial.skip")
	if _back != null:
		_back.text = TextManager.t("tutorial.back")
	if _next != null:
		var last := _index + 1 >= card_count()
		_next.text = TextManager.t("tutorial.start" if last else "tutorial.next")

## Same face as the maths board, from the same theme roles: the lesson and the
## question it leads into should read as one surface, not two screens.
func _board_face() -> StyleBox:
	var box := StyleBoxFlat.new()
	box.bg_color = ThemeManager.get_color_value(String(Config.tutorial("roles/board_bg", "boardBg")))
	box.set_border_width_all(int(_layout("border_width", 4)))
	box.border_color = ThemeManager.get_color_value(String(Config.tutorial("roles/board_border", "boardBorder")))
	box.set_corner_radius_all(int(_layout("corner_radius", 22)))
	box.set_content_margin_all(int(_layout("padding", 26)))
	box.shadow_color = Color(ThemeManager.get_color_value("ink"), 0.55)
	box.shadow_size = int(_layout("shadow_size", 12))
	box.shadow_offset = Vector2(0, float(_layout("shadow_offset_y", 6)))
	return box
