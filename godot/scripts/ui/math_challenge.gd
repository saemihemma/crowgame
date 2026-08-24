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

var current_problem: Dictionary = {}
var _coins_reward := 1
var _wrong_attempts := 0
var _presented_at := 0
var _done := false

const BOARD_PAD := 28
const HEADER_ICON := 34.0

var _buttons: Array[AnswerButton] = []
var _question_label: Label
var _board: PanelContainer
var _verdict: Label

func present(problem: Dictionary, opts: Dictionary = {}) -> void:
	current_problem = problem
	_coins_reward = int(opts.get("coinsReward", 1))
	_wrong_attempts = 0
	_done = false
	_presented_at = Time.get_ticks_msec()
	_build_ui(opts)
	EventBus.math_challenge_start.emit({"problemId": String(problem.get("id", ""))})
	EventBus.math_problem_presented.emit(problem)

func is_active() -> bool:
	return not _done

## Submit an answer by option index (called by buttons and by tests).
func submit_answer(index: int) -> void:
	if _done:
		return
	var answer: Dictionary = current_problem.get("answer", {})
	var options: Array = answer.get("options", [])
	if index < 0 or index >= options.size():
		return
	var is_correct := str(options[index]) == str(answer.get("correct", null))
	EventBus.math_answer_submitted.emit({"problemId": current_problem.get("id", ""), "selectedAnswer": options[index], "isCorrect": is_correct})

	if is_correct:
		AudioManager.play_event("answer_correct")
		_done = true
		_set_buttons_enabled(false)
		_mark(index, AnswerButton.State.RIGHT)
		_say("math.verdict_right", "yes")
		var first_attempt := _wrong_attempts == 0
		get_tree().create_timer(CORRECT_DELAY).timeout.connect(
			_finish.bind(true, first_attempt), CONNECT_ONE_SHOT)
	else:
		_wrong_attempts += 1
		AudioManager.play_event("answer_wrong")
		# Say which one was wrong, and say it on the button that was touched.
		# Until now a wrong answer dimmed all four options for 600ms and said
		# nothing at all: the child learned that something bad had happened, but
		# not what, which is the one thing a teaching game must never do.
		_mark(index, AnswerButton.State.WRONG)
		_buttons[index].shake()
		if _wrong_attempts >= 2:
			_done = true
			_set_buttons_enabled(false)
			# Second wrong ends the attempt, so now the answer is worth showing —
			# the child leaves knowing it rather than just having lost.
			_reveal_correct()
			_say("math.verdict_answer", "owl")
			get_tree().create_timer(FAIL_DELAY).timeout.connect(
				_finish.bind(false, false), CONNECT_ONE_SHOT)
		else:
			# First wrong: brief lockout before the retry — anti-spam pacing for
			# young players. The correct answer is deliberately NOT revealed;
			# there is a second try, and giving it away would waste it.
			_set_buttons_enabled(false)
			_say("math.verdict_not_yet", "notyet")
			get_tree().create_timer(RETRY_LOCKOUT).timeout.connect(
				_reenable_for_retry, CONNECT_ONE_SHOT)

func _finish(correct: bool, first_attempt: bool) -> void:
	EventBus.math_challenge_complete.emit(_result(correct, first_attempt))
	_close()

## Hand the board back for the second try. The wrong option stays marked: it is
## a fact about what has already been tried, and clearing it would invite the
## same tap again.
func _reenable_for_retry() -> void:
	if _done:
		return
	_set_buttons_enabled(true)
	for b in _buttons:
		if b.get_state() == AnswerButton.State.IDLE:
			b.grab_focus()
			break

func _mark(index: int, state: int) -> void:
	if index >= 0 and index < _buttons.size():
		_buttons[index].set_state(state)

func _reveal_correct() -> void:
	var answer: Dictionary = current_problem.get("answer", {})
	var options: Array = answer.get("options", [])
	for i in options.size():
		if str(options[i]) == str(answer.get("correct", null)):
			_mark(i, AnswerButton.State.RIGHT)
			return

## One line of plain feedback under the options, in the colour of the verdict.
## Colour alone would fail Gate B6 (nothing may mean something by colour only),
## and words alone go unread by a child still learning to; together they work.
func _say(key: String, colour_role: String) -> void:
	if _verdict == null:
		return
	var answer: Dictionary = current_problem.get("answer", {})
	_verdict.text = TextManager.t(key, [str(answer.get("correct", ""))])
	_verdict.add_theme_color_override("font_color", ThemeManager.get_color_value(colour_role))
	_verdict.modulate.a = 0.0
	create_tween().tween_property(_verdict, "modulate:a", 1.0, 0.18)

func _result(correct: bool, first_attempt: bool) -> Dictionary:
	var has_hint: bool = String(current_problem.get("hint", "")) != "" and _wrong_attempts > 0
	return {
		"problemId": current_problem.get("id", ""),
		"correct": correct, "firstAttempt": first_attempt,
		"reward": _coins_reward if correct else 0,
		"hintsUsed": 1 if has_hint else 0,
		"responseMs": Time.get_ticks_msec() - _presented_at,
		"wrongAttempts": _wrong_attempts,
	}

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

	# THE BOARD. Previously there wasn't one: the question and the options were
	# loose labels floating on a dimmed level, with grass tiles showing through
	# the answer buttons. A surface is what separates "the game, paused" from
	# "the thing you are being asked".
	_board = PanelContainer.new()
	_board.add_theme_stylebox_override("panel", _board_face())
	center.add_child(_board)

	var vbox := VBoxContainer.new()
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	vbox.add_theme_constant_override("separation", 18)
	_board.add_child(vbox)

	_build_header(vbox, opts)

	# The question is the subject of the screen, so it is the largest thing on
	# it. It used to render at the same weight as the four options.
	_question_label = Label.new()
	_question_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_question_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_question_label.custom_minimum_size.x = float(Config.ui("math_challenge/board_min_w", 560)) - BOARD_PAD * 2
	_question_label.text = String(current_problem.get("prompt", {}).get("text", ""))
	_question_label.add_theme_font_size_override("font_size", int(Config.ui("math_challenge/question_font_size", 40)))
	_question_label.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	vbox.add_child(_question_label)

	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 16)
	vbox.add_child(row)

	_buttons.clear()
	var options: Array = current_problem.get("answer", {}).get("options", [])
	for i in options.size():
		var b := AnswerButton.new()
		b.text = str(options[i])
		b.custom_minimum_size = Vector2(Config.ui("math_challenge/option_min_w", 116), Config.ui("math_challenge/option_min_h", 88))
		b.add_theme_font_size_override("font_size", int(Config.ui("math_challenge/option_font_size", 32)))
		var idx := i
		b.pressed.connect(func(): submit_answer(idx))
		row.add_child(b)
		_buttons.append(b)
	if _buttons.size() > 0:
		_buttons[0].grab_focus()

	# The line that answers "how did that go". Kept in the layout at all times
	# rather than added on a wrong answer, so the board does not resize under a
	# child's finger mid-attempt.
	_verdict = Label.new()
	_verdict.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_verdict.add_theme_font_size_override("font_size", int(Config.ui("math_challenge/verdict_font_size", 24)))
	_verdict.custom_minimum_size.y = 30
	_verdict.modulate.a = 0.0
	vbox.add_child(_verdict)

	# Elastic pop-in once the layout has computed sizes.
	_pop_in.call_deferred(_board)

## Who is asking. The owl is the reason any of this matters — the child is here
## to free it — and it was the one thing the board never showed.
func _build_header(vbox: VBoxContainer, opts: Dictionary) -> void:
	var name_str := String(opts.get("npcName", ""))
	var greet := String(opts.get("npcGreeting", ""))
	if name_str == "" and greet == "":
		return

	var head := HBoxContainer.new()
	head.alignment = BoxContainer.ALIGNMENT_CENTER
	head.add_theme_constant_override("separation", 12)
	vbox.add_child(head)

	var icon_texture := OwlRing.new()._load_icon()
	if icon_texture != null:
		var icon := TextureRect.new()
		icon.texture = icon_texture
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.custom_minimum_size = Vector2(HEADER_ICON, HEADER_ICON)
		head.add_child(icon)

	var header := Label.new()
	header.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var pc := int(opts.get("problemCount", 1))
	var idx := int(opts.get("currentProblemIndex", 1))
	# Only shown for a chained owl. A lone "Problem 1 of 1" is noise.
	var progress := "   %d / %d" % [idx, pc] if pc > 1 else ""
	header.text = "%s   \"%s\"%s" % [name_str, greet, progress]
	header.add_theme_font_size_override("font_size", int(Config.ui("math_challenge/header_font_size", 22)))
	header.add_theme_color_override("font_color", ThemeManager.get_color_value("owl"))
	head.add_child(header)

## The board's surface. Themed roles rather than fixed colours, so each world
## brings its own slate — and swappable for a nine-slice texture the day one is
## drawn, without touching this file (brand/ASSET_MANIFEST.md P1).
func _board_face() -> StyleBox:
	var texture_path := String(Config.ui("math_challenge/board_texture", "res://assets/sprites/ui/board/board-9slice.png"))
	if ResourceLoader.exists(texture_path):
		var nine := StyleBoxTexture.new()
		nine.texture = load(texture_path)
		var inset := int(Config.ui("math_challenge/board_texture_inset", 24))
		nine.set_texture_margin_all(inset)
		nine.set_content_margin_all(BOARD_PAD)
		return nine

	var box := StyleBoxFlat.new()
	box.bg_color = ThemeManager.get_color_value("boardBg")
	box.set_border_width_all(4)
	box.border_color = ThemeManager.get_color_value("boardBorder")
	box.set_corner_radius_all(22)
	box.set_content_margin_all(BOARD_PAD)
	box.shadow_color = Color(ThemeManager.get_color_value("ink"), 0.55)
	box.shadow_size = 12
	box.shadow_offset = Vector2(0, 6)
	return box

func _pop_in(node: Control) -> void:
	if is_instance_valid(node):
		UiFx.elastic_entrance(node)

func _set_buttons_enabled(enabled: bool) -> void:
	for b in _buttons:
		b.disabled = not enabled

func _close() -> void:
	closed.emit()
	queue_free()
