extends CanvasLayer
## MathChallenge — Godot port of MathChallengeScene + MathBoard.
## Overlay shown on owl interaction: NPC header (name + greeting + progress),
## the question, and MCQ option buttons. Correct -> after a celebration beat
## emit math_challenge_complete{correct, firstAttempt,...}; first wrong -> retry;
## second wrong -> dismiss as failed. Emits math_problem_presented on show so
## ELOUpdateManager can capture problem context.

signal closed

# Timings come from data/tuning/ui_tuning.json (Config.ui("math_challenge/...")).
@onready var CORRECT_DELAY: float = Config.ui("math_challenge/correct_delay", 1.5)
@onready var FAIL_DELAY: float = Config.ui("math_challenge/fail_delay", 0.8)
@onready var RETRY_LOCKOUT: float = Config.ui("math_challenge/retry_lockout", 0.6)
# After the final miss the correct answer is revealed with its explanation;
# hold long enough for a young reader to absorb it (MathChallengeScene.ts: 3s).
@onready var TEACH_DELAY: float = Config.ui("math_challenge/teach_delay", 3.0)

var current_problem: Dictionary = {}
var _coins_reward := 1
var _wrong_attempts := 0
var _presented_at := 0
var _first_response_ms := 0
var _done := false
# Worked-example mode: the owl demonstrates, the child only watches.
var _is_demo := false
# Freebie: first-ever try at a newly taught skill. A win counts normally;
# a miss is never recorded against the learner.
var _is_freebie := false

var _buttons: Array[Button] = []
var _question_label: Label
var _hint_label: Label
# Display order is shuffled so the correct answer's on-screen slot is random;
# the hand-authored pools carry a position bias kids learn to exploit.
# submit_answer() still takes an index into answer.options (test contract).
var _display_order: Array[int] = []

func present(problem: Dictionary, opts: Dictionary = {}) -> void:
	current_problem = problem
	_coins_reward = int(opts.get("coinsReward", 1))
	_wrong_attempts = 0
	_done = false
	_presented_at = Time.get_ticks_msec()
	_first_response_ms = 0
	_is_demo = bool(opts.get("demo", false))
	_is_freebie = bool(opts.get("freebie", false))
	_build_ui(opts)

	if _is_demo:
		# Worked example: no input, no learner-model events. Two beats — think
		# aloud (hint), then the answer with its explanation — then hand over.
		_set_buttons_enabled(false)
		get_tree().create_timer(0.9).timeout.connect(
			func(): _show_hint(_localised("hint")), CONNECT_ONE_SHOT)
		get_tree().create_timer(2.4).timeout.connect(_reveal_answer, CONNECT_ONE_SHOT)
		get_tree().create_timer(4.2).timeout.connect(func():
			var viewport_size := get_viewport().get_visible_rect().size
			DopamineFX.number_fly_up(self, viewport_size / 2.0 - Vector2(0, 120), TextManager.t("math.demo_your_turn"), ThemeManager.get_color_value("accent"))
		, CONNECT_ONE_SHOT)
		get_tree().create_timer(5.2).timeout.connect(func():
			_done = true
			EventBus.math_demo_complete.emit({"problemId": current_problem.get("id", ""), "domain": current_problem.get("domain", "")})
			_close()
		, CONNECT_ONE_SHOT)
		return

	EventBus.math_challenge_start.emit({"problemId": String(problem.get("id", ""))})
	EventBus.math_problem_presented.emit(problem)

func is_active() -> bool:
	return not _done

## Submit an answer by option index (called by buttons and by tests).
func submit_answer(index: int) -> void:
	if _done or _is_demo:
		return
	var answer: Dictionary = current_problem.get("answer", {})
	var options: Array = answer.get("options", [])
	if index < 0 or index >= options.size():
		return
	var is_correct := str(options[index]) == str(answer.get("correct", null))
	# Time-to-first-answer, captured at the tap so celebration and teaching
	# delays never inflate the telemetry (matches MathChallengeScene.ts).
	if _first_response_ms == 0:
		_first_response_ms = Time.get_ticks_msec() - _presented_at
	EventBus.math_answer_submitted.emit({"problemId": current_problem.get("id", ""), "selectedAnswer": options[index], "isCorrect": is_correct})

	if is_correct:
		AudioManager.play_event("answer_correct")
		_done = true
		_set_buttons_enabled(false)
		var first_attempt := _wrong_attempts == 0
		get_tree().create_timer(CORRECT_DELAY).timeout.connect(
			_finish.bind(true, first_attempt), CONNECT_ONE_SHOT)
	else:
		_wrong_attempts += 1
		AudioManager.play_event("answer_wrong")
		if _wrong_attempts >= 2:
			_done = true
			_set_buttons_enabled(false)
			# Second miss: teach before dismissing — reveal the correct
			# answer with the authored explanation.
			_reveal_answer()
			get_tree().create_timer(TEACH_DELAY).timeout.connect(
				_finish.bind(false, false), CONNECT_ONE_SHOT)
		else:
			# First wrong: show the authored hint and pause briefly before the
			# retry (MathBoard re-enables after 600ms — anti-spam pacing).
			_show_hint(String(current_problem.get("hint", "")))
			_set_buttons_enabled(false)
			get_tree().create_timer(RETRY_LOCKOUT).timeout.connect(
				_reenable_for_retry, CONNECT_ONE_SHOT)

func _finish(correct: bool, first_attempt: bool) -> void:
	EventBus.math_challenge_complete.emit(_result(correct, first_attempt))
	_close()

func _reenable_for_retry() -> void:
	if not _done:
		_set_buttons_enabled(true)

func _result(correct: bool, first_attempt: bool) -> Dictionary:
	var has_hint: bool = String(current_problem.get("hint", "")) != "" and _wrong_attempts > 0
	return {
		"problemId": current_problem.get("id", ""),
		"correct": correct, "firstAttempt": first_attempt,
		"reward": _coins_reward if correct else 0,
		"hintsUsed": 1 if has_hint else 0,
		"responseMs": _first_response_ms,
		"wrongAttempts": _wrong_attempts,
		"freebie": _is_freebie,
	}

## After the final allowed miss: highlight the correct answer, dim the rest,
## and show the authored explanation so the miss ends in learning.
func _reveal_answer() -> void:
	var answer: Dictionary = current_problem.get("answer", {})
	var correct_text := str(answer.get("correct", null))
	for i in _buttons.size():
		var value_index: int = _display_order[i] if i < _display_order.size() else i
		var options: Array = answer.get("options", [])
		var is_correct_button := value_index < options.size() and str(options[value_index]) == correct_text
		if is_correct_button:
			_buttons[i].disabled = false
			_buttons[i].add_theme_color_override("font_color", ThemeManager.get_color_value("accent"))
			_buttons[i].grab_focus()
		else:
			_buttons[i].modulate.a = 0.35
	var explanation := _localised("explanation")
	if explanation == "":
		explanation = _localised("hint")
	_show_hint(explanation)

func _show_hint(text: String) -> void:
	if _hint_label == null or text == "":
		return
	_hint_label.text = text
	_hint_label.visible = true

func _build_ui(opts: Dictionary) -> void:
	var dim := ColorRect.new()
	dim.color = ThemeManager.get_color_value("scrim")
	dim.anchor_right = 1.0
	dim.anchor_bottom = 1.0
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(dim)

	var center := CenterContainer.new()
	center.anchor_right = 1.0
	center.anchor_bottom = 1.0
	dim.add_child(center)

	var vbox := VBoxContainer.new()
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	vbox.add_theme_constant_override("separation", 16)
	center.add_child(vbox)

	var name_str := String(opts.get("npcName", ""))
	var greet := String(opts.get("npcGreeting", ""))
	if name_str != "" or greet != "":
		var header := Label.new()
		header.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var pc := int(opts.get("problemCount", 1))
		var idx := int(opts.get("currentProblemIndex", 1))
		# Was the hardcoded English "Problem %d of %d". The hardcode guard missed
		# it because it is a format string assigned to a var, not `.text = "..."`.
		var progress := "\n" + TextManager.t("math.progress", [idx, pc]) if pc > 1 else ""
		header.text = "%s\n\"%s\"%s" % [name_str, greet, progress]
		header.add_theme_font_size_override("font_size", int(Config.ui("math_challenge/header_font_size", 22)))
		vbox.add_child(header)

	# Progress pips: wins already banked toward the next level-up in this
	# problem's domain. The third pip is the step-up moment itself.
	if not _is_demo:
		vbox.add_child(_build_pips())

	_question_label = Label.new()
	_question_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var prompt_text := _localised("prompt")
	_question_label.text = prompt_text
	# Long prompts (framed questions and word problems) scale down and wrap so
	# the text always fits (mirrors MathBoard.ts adaptive sizing).
	var question_size := int(Config.ui("math_challenge/question_font_size", 40))
	if prompt_text.length() > 30:
		question_size = int(Config.ui("math_challenge/question_font_size_long", 24))
		_question_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_question_label.custom_minimum_size = Vector2(Config.ui("math_challenge/question_wrap_width", 520), 0)
	elif prompt_text.length() > 14:
		question_size = int(Config.ui("math_challenge/question_font_size_medium", 30))
	_question_label.add_theme_font_size_override("font_size", question_size)
	vbox.add_child(_question_label)

	# Hint / explanation line: hidden until a miss needs it.
	_hint_label = Label.new()
	_hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hint_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_hint_label.custom_minimum_size = Vector2(Config.ui("math_challenge/question_wrap_width", 520), 0)
	_hint_label.add_theme_font_size_override("font_size", int(Config.ui("math_challenge/hint_font_size", 20)))
	_hint_label.add_theme_color_override("font_color", ThemeManager.get_color_value("accent"))
	_hint_label.visible = false
	vbox.add_child(_hint_label)

	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 16)
	vbox.add_child(row)

	_buttons.clear()
	var options: Array = current_problem.get("answer", {}).get("options", [])
	# Shuffle the on-screen order; submit_answer still takes the index into
	# answer.options, so callers and tests keep their contract.
	_display_order.clear()
	for i in options.size():
		_display_order.append(i)
	_display_order.shuffle()
	for i in _display_order.size():
		var value_index := _display_order[i]
		var b := Button.new()
		b.text = str(options[value_index])
		b.custom_minimum_size = Vector2(Config.ui("math_challenge/option_min_w", 96), Config.ui("math_challenge/option_min_h", 72))
		b.add_theme_font_size_override("font_size", int(Config.ui("math_challenge/option_font_size", 32)))
		b.focus_mode = Control.FOCUS_ALL
		var idx := value_index
		b.pressed.connect(func(): submit_answer(idx))
		UiFx.attach_focus_highlight(b)
		row.add_child(b)
		_buttons.append(b)
	if _buttons.size() > 0:
		_buttons[0].grab_focus()
	# Elastic pop-in once the layout has computed sizes.
	_pop_in.call_deferred(vbox)

func _pop_in(node: Control) -> void:
	if is_instance_valid(node):
		UiFx.elastic_entrance(node)

## Small circles drawn in code (no glyphs — UI primitives are drawn, per the
## i18n house rules): filled = wins banked, outlined = wins still to earn.
func _build_pips() -> Control:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 10)
	var target: int = LearnerStateManager.get_promotion_win_target()
	var wins: int = mini(target, LearnerStateManager.get_wins_at_current_step(String(current_problem.get("domain", ""))))
	var accent := ThemeManager.get_color_value("accent")
	for i in target:
		var pip := Panel.new()
		pip.custom_minimum_size = Vector2(14, 14)
		var style := StyleBoxFlat.new()
		style.set_corner_radius_all(7)
		if i < wins:
			style.bg_color = accent
		else:
			style.bg_color = Color(0, 0, 0, 0)  # hardcode-ok: fully transparent, not a themed colour
			style.set_border_width_all(2)
			style.border_color = accent
		pip.add_theme_stylebox_override("panel", style)
		row.add_child(pip)
	return row

func _set_buttons_enabled(enabled: bool) -> void:
	for b in _buttons:
		b.disabled = not enabled

func _close() -> void:
	closed.emit()
	queue_free()


## One of the problem's three sentences, in the active locale.
##
## The pools keep prompt.text, hint and explanation in canonical English because
## tools/math_verifier.ts parses the operands out of prompt.text, the replay key
## tests it with literal English prefixes, and the golden fixtures compare it byte
## for byte. Localisation is an overlay: an optional `phrasing` sibling naming an
## i18n key, its numeric parameters and, where the wording inflects, the parameter
## that drives plural agreement. Anything unresolvable falls back to the English,
## so a child sees their own language or they see English, never a raw key.
##
## Mirrors src/math/problemPhrasing.ts in the web build.
func _localised(field: String) -> String:
	var english := ""
	if field == "prompt":
		english = String(current_problem.get("prompt", {}).get("text", ""))
	else:
		english = String(current_problem.get(field, ""))

	var phrasing: Variant = current_problem.get("phrasing", null)
	if not (phrasing is Dictionary):
		return english
	var ref: Variant = (phrasing as Dictionary).get(field, null)
	if not (ref is Dictionary) or not (ref as Dictionary).has("key"):
		return english

	var entry := ref as Dictionary
	var rendered := TextManager.tp(
		String(entry["key"]),
		entry.get("params", {}),
		String(entry.get("plural", "")),
	)
	return english if rendered.is_empty() else rendered
