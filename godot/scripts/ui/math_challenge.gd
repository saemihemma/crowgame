extends CanvasLayer
## MathChallenge — Godot port of MathChallengeScene + MathBoard.
## Overlay shown on owl interaction: NPC header (name + greeting + progress),
## the question, and MCQ option buttons. Correct -> after a celebration beat
## emit math_challenge_complete{correct, firstAttempt,...}; first wrong -> retry;
## second wrong -> dismiss as failed. Emits math_problem_presented on show so
## ELOUpdateManager can capture problem context.

signal closed

# Timings come from data/tuning/ui_tuning.json (Config.ui("math_challenge/...")).
# Answer-feedback pacing comes from data/tuning/math_tuning.json, beside every
# other tunable math-experience number, rather than from ui_tuning.json. The
# retry lockout in particular was 600ms, which is shorter than the feedback it is
# meant to cover: the wrong-answer tint, the hint fading in and the retry chime
# all outlast it, so the board re-enabled underneath its own animation.
@onready var CORRECT_DELAY: float = _feedback_ms("correctCloseMs", 1500.0) / 1000.0
@onready var FAIL_DELAY: float = Config.ui("math_challenge/fail_delay", 0.8)
@onready var RETRY_LOCKOUT: float = _feedback_ms("retryLockoutMs", 900.0) / 1000.0
# After the final miss the correct answer is revealed with its explanation;
# hold long enough for a young reader to absorb it (MathChallengeScene.ts: 3s).
@onready var TEACH_DELAY: float = _feedback_ms("revealCloseMs", 3000.0) / 1000.0


static func _feedback_ms(key: String, fallback: float) -> float:
	var tuning: Dictionary = DataManager.get_dict("MATH_TUNING")
	var feedback: Variant = tuning.get("feedback", {})
	if feedback is Dictionary:
		return float((feedback as Dictionary).get(key, fallback))
	return fallback



var current_problem: Dictionary = {}
var _coins_reward := 1
var _wrong_attempts := 0
var _presented_at := 0
var _first_response_ms := 0
var _done := false
# Freebie: first-ever try at a newly taught skill. A win counts normally;
# a miss is never recorded against the learner.
var _is_freebie := false
# Golden: a seeded 1-in-N arrival with a bonus coin multiplier on a win.
var _is_golden := false

const BOARD_PAD := 28
const HEADER_ICON := 34.0

var _buttons: Array[AnswerButton] = []
var _board: PanelContainer
var _question_label: Label
var _hint_label: Label
# Display order is shuffled so the correct answer's on-screen slot is random;
# the hand-authored pools carry a position bias kids learn to exploit.
# submit_answer() still takes an index into answer.options (test contract).
var _display_order: Array[int] = []

func _ready() -> void:
	# Connected on the node, not per-present, and torn down with the node --
	# queue_free() drops the connection, so handlers cannot stack across
	# successive owl encounters.
	TextManager.locale_changed.connect(_on_locale_changed_signal)


func _on_locale_changed_signal(_code: String) -> void:
	_on_locale_changed()


func present(problem: Dictionary, opts: Dictionary = {}) -> void:
	current_problem = problem
	_coins_reward = int(opts.get("coinsReward", 1))
	_wrong_attempts = 0
	_done = false
	_presented_at = Time.get_ticks_msec()
	_first_response_ms = 0
	_is_freebie = bool(opts.get("freebie", false))
	_is_golden = bool(opts.get("golden", false))
	# Clear any previous board. present() is public and re-presenting on the same
	# overlay would otherwise stack a second scrim and board over the first.
	for child in get_children():
		child.queue_free()
	_build_ui(opts)
	if _is_golden:
		AudioManager.play_event("golden")

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
	# Time-to-first-answer, captured at the tap so celebration and teaching
	# delays never inflate the telemetry (matches MathChallengeScene.ts).
	if _first_response_ms == 0:
		_first_response_ms = Time.get_ticks_msec() - _presented_at
	EventBus.math_answer_submitted.emit({"problemId": current_problem.get("id", ""), "selectedAnswer": options[index], "isCorrect": is_correct})

	if is_correct:
		AudioManager.play_event("answer_correct")
		_done = true
		_set_buttons_enabled(false)
		_mark(index, AnswerButton.State.RIGHT)
		var first_attempt := _wrong_attempts == 0
		get_tree().create_timer(CORRECT_DELAY).timeout.connect(
			_finish.bind(true, first_attempt), CONNECT_ONE_SHOT)
	else:
		_wrong_attempts += 1
		AudioManager.play_event("answer_wrong")
		# Say WHICH one was wrong, on the button that was touched. A wrong answer
		# used to dim all four options and mark none of them: the child learned
		# that something bad had happened, but not what.
		_mark(index, AnswerButton.State.WRONG)
		_shake(index)
		if _wrong_attempts >= 2:
			_done = true
			_set_buttons_enabled(false)
			# Second miss: teach before dismissing — reveal the correct
			# answer with the authored explanation.
			_reveal_answer()
			_mark_correct_option()
			get_tree().create_timer(TEACH_DELAY).timeout.connect(
				_finish.bind(false, false), CONNECT_ONE_SHOT)
		else:
			# First wrong: show a hint and pause briefly before the retry
			# (anti-spam pacing).
			#
			# The hint speaks to THIS miss when the miss is recognisable -- out by
			# one, out by ten, a factor of ten, digits the wrong way round -- and to
			# the problem otherwise. Every problem has carried `misconceptionTags`
			# since it was authored and nothing had ever read them, so a child who
			# was one away and a child who guessed got the same sentence.
			#
			# Through _localised(), not the raw field: an Icelandic player was
			# getting the English hint at exactly the moment they needed help
			# most. The reveal path below had been localised; this one was missed.
			_show_hint(_miss_hint(options[index]))
			_set_buttons_enabled(false)
			get_tree().create_timer(RETRY_LOCKOUT).timeout.connect(
				_reenable_for_retry, CONNECT_ONE_SHOT)

func _finish(correct: bool, first_attempt: bool) -> void:
	EventBus.math_challenge_complete.emit(_result(correct, first_attempt))
	_close()

## ANSWERING FROM THE KEYBOARD. Two routes, both by POSITION on screen.
##
## 1. A digit, 1 being the leftmost option: one key, one answer, no state.
## 2. Left and right to move a mark along the row, Enter to commit it.
##
## The second is what a playtester asked for on a PC, and it is the one that has
## to be built carefully, because a version of it is what broke the board once
## before. Godot's focus ring is driven by `ui_left`/`ui_right` -- the arrow keys,
## which are also how the crow walks -- and by `ui_accept`, which is Enter AND
## Space, Space also being jump. So the two keys the game had just taught a child
## committed whichever option the ring had drifted onto, and the game answered its
## own first question. FOCUS_NONE was the fix, and the options still take no
## focus: nothing here undoes that.
##
## What is different is that this is the board's own mark on its own row, moved by
## the board's own actions, and it does not exist until a child presses an arrow.
## `answer_prev`/`answer_next` are Left and Right; `answer_confirm` is Enter and
## the keypad's Enter, and deliberately NOT Space -- Space is jump, and jump must
## never be able to commit an answer. A touch or mouse player sees no mark at all,
## which is the overwhelmingly common case and is unchanged.
##
## Position, not value index: the options are shuffled per render, and "the
## second thing I can see" is the only thing a key can honestly mean.
## `_display_order[i]` is the translation the mouse path already goes through.
func _unhandled_input(event: InputEvent) -> void:
	if _done:
		return
	if event.is_action_pressed("answer_prev"):
		_move_cursor(-1)
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("answer_next"):
		_move_cursor(1)
		get_viewport().set_input_as_handled()
		return
	if event.is_action_pressed("answer_confirm"):
		_commit_cursor()
		get_viewport().set_input_as_handled()
		return
	if not Config.flag("input/space_is_sprint", true):
		return
	for i in mini(_display_order.size(), 4):
		if not event.is_action_pressed("answer_%d" % (i + 1)):
			continue
		# The retry lockout disables the buttons; the keyboard has to honour it or
		# it becomes a way to answer during the wrong-answer beat, which is the
		# lockout's whole reason for existing.
		if i < _buttons.size() and _buttons[i].disabled:
			get_viewport().set_input_as_handled()
			return
		submit_answer(_display_order[i])
		get_viewport().set_input_as_handled()
		return

## The mark, and the rules for moving it, live in AnswerCursor -- shared with the
## lesson card's guided-try row, which is the same row of answers on a different
## surface and had none of this until the screen tour walked into it.
var _cursor := AnswerCursor.new()

func _move_cursor(step: int) -> void:
	if _cursor.move(_buttons, step):
		AudioManager.play_event("button_focus")

func _set_cursor(at: int) -> void:
	_cursor.set_to(_buttons, at)

func _commit_cursor() -> void:
	var at := _cursor.chosen(_buttons)
	if at < 0 or at >= _display_order.size():
		return
	# Position, not value index: the options are shuffled per render, and "the
	# second thing I can see" is the only thing a key can honestly mean.
	# `_display_order[i]` is the translation the mouse path already goes through.
	submit_answer(_display_order[at])

## Hand the board back for the second try. The wrong option stays marked: it is
## a fact about what has already been tried, and clearing it would invite the
## same tap again. Nothing is focused - the options take no keyboard focus at
## all (see AnswerButton); _unhandled_input above is the keyboard path.
func _reenable_for_retry() -> void:
	if _done:
		return
	_set_buttons_enabled(true)
	# The mark comes off. It is standing on the option that was just tried and
	# missed -- that is how it got submitted -- and leaving it there would put the
	# cursor on the one answer we already know is wrong, with Enter one key away.
	_set_cursor(-1)

func _result(correct: bool, first_attempt: bool) -> Dictionary:
	var has_hint: bool = String(current_problem.get("hint", "")) != "" and _wrong_attempts > 0
	# Golden wins multiply the coin reward (bigger for first-try); the
	# multipliers live in the shared math_tuning.json.
	var reward := _coins_reward if correct else 0
	if correct and _is_golden:
		var g: Dictionary = DataManager.get_dict("MATH_TUNING").get("golden", {})
		var mult := float(g.get("firstTryCoinMultiplier", 1.0)) if first_attempt else float(g.get("retryCoinMultiplier", 1.0))
		reward = int(round(_coins_reward * mult))
	return {
		"problemId": current_problem.get("id", ""),
		"correct": correct, "firstAttempt": first_attempt,
		"reward": reward,
		"hintsUsed": 1 if has_hint else 0,
		"responseMs": _first_response_ms,
		"wrongAttempts": _wrong_attempts,
		"freebie": _is_freebie,
		"golden": _is_golden,
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
		else:
			_buttons[i].modulate.a = 0.35
	var explanation := _localised("explanation")
	if explanation == "":
		explanation = _localised("hint")
	_show_hint(explanation)

## What to say about a wrong answer.
##
## The misconception-specific line when the miss identifies one, the problem's
## authored hint otherwise. Never both: two sentences at the moment a child has
## just got something wrong is the point at which they stop reading.
func _miss_hint(tapped: Variant) -> String:
	var key := MathMisconception.hint_key(current_problem, tapped)
	if key != "":
		var targeted := TextManager.t(key)
		if targeted != "" and targeted != key:
			return targeted
	return _localised("hint")

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

	# THE BOARD. There wasn't one: the question and the options were loose labels
	# floating on a dimmed level, with grass tiles visible through the answer
	# buttons. A surface is what separates "the game, paused" from "the thing you
	# are being asked".
	_board = PanelContainer.new()
	_board.add_theme_stylebox_override("panel", _board_face())

	var vbox := VBoxContainer.new()
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	vbox.add_theme_constant_override("separation", 16)
	_board.add_child(vbox)
	# The card the fitter owns: the gold frame when there is one, the board
	# otherwise.
	#
	# Fitted rather than centred. `stretch/aspect=expand` never makes the viewport
	# smaller than 960x540, but on any display at 16:9 or wider it is EXACTLY 540
	# tall, and a long word problem with a hint under it is taller than that --
	# the answer row is the part that falls off. FitBox shrinks the card only when
	# it has to. (This used to sit in the upper 78% so a camera lift could park
	# the crow in the strip below; the lift is gone, and with it the reason for an
	# off-centre board.)
	var card: Control = _board
	if _is_golden:
		# Golden arrival: a pulsing gold frame around the board (mirrors
		# MathChallengeScene.decorateGolden). Announcement, not reward — the
		# coin bonus lands on the win.
		var frame := PanelContainer.new()
		var frame_style := StyleBoxFlat.new()
		frame_style.bg_color = Color(0, 0, 0, 0)  # hardcode-ok: fully transparent, not a themed colour
		frame_style.set_border_width_all(5)
		frame_style.border_color = Color(1.0, 0.843, 0.0)  # hardcode-ok: golden means literal gold in both ports
		frame_style.set_corner_radius_all(20)
		frame_style.set_content_margin_all(24)
		frame.add_theme_stylebox_override("panel", frame_style)
		frame.add_child(_board)
		card = frame
		var tw := frame.create_tween().set_loops()
		tw.tween_property(frame, "self_modulate:a", 0.45, 0.65).set_trans(Tween.TRANS_SINE)
		tw.tween_property(frame, "self_modulate:a", 1.0, 0.65).set_trans(Tween.TRANS_SINE)
	dim.add_child(FitBox.around(card))

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
		header.add_theme_color_override("font_color", ThemeManager.get_color_value("owl"))

		# The owl that is asking. The child is here to free it, and the board
		# never showed it.
		var head := HBoxContainer.new()
		head.alignment = BoxContainer.ALIGNMENT_CENTER
		head.add_theme_constant_override("separation", 12)
		var icon_texture := OwlRing.new()._load_icon()
		if icon_texture != null:
			var icon := TextureRect.new()
			icon.texture = icon_texture
			icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			icon.custom_minimum_size = Vector2(HEADER_ICON, HEADER_ICON)
			head.add_child(icon)
		head.add_child(header)
		_add_help_button(head)
		vbox.add_child(head)

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
	_question_label.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	vbox.add_child(_question_label)

	# Counting problems get objects instead of a row of asterisks.
	var tokens := CountRow.tokens_in(prompt_text)
	if tokens > 0:
		_question_label.text = CountRow.caption_in(prompt_text)
		var count_row := CountRow.new()
		var centred := CenterContainer.new()
		centred.add_child(count_row)
		vbox.add_child(centred)
		# The prompt's own symbol picks the token shape, so two counting problems
		# in a row do not look like the same question asked twice.
		count_row.setup(tokens, CountRow.marker_in(prompt_text))

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
	# A fresh row of options is a fresh question: nothing is marked until this
	# child touches an arrow key again.
	_cursor.at = -1
	var options: Array = current_problem.get("answer", {}).get("options", [])
	# Shuffle the on-screen order; submit_answer still takes the index into
	# answer.options, so callers and tests keep their contract.
	_display_order.clear()
	for i in options.size():
		_display_order.append(i)
	_display_order.shuffle()
	for i in _display_order.size():
		var value_index := _display_order[i]
		var b := AnswerButton.new()
		b.text = str(options[value_index])
		b.custom_minimum_size = Vector2(Config.ui("math_challenge/option_min_w", 116), Config.ui("math_challenge/option_min_h", 88))
		b.add_theme_font_size_override("font_size", int(Config.ui("math_challenge/option_font_size", 32)))
		var idx := value_index
		b.pressed.connect(func(): submit_answer(idx))
		row.add_child(b)
		_buttons.append(b)
	# Elastic pop-in once the layout has computed sizes.
	_pop_in.call_deferred(vbox)

## "I don't get it" as a button.
##
## The lessons used to arrive whether or not a child wanted one, and never when
## they did: teaching fired in front of a question whose concept was unseen, and
## after that the idea was marked seen and gone forever. A child stuck on the
## board had no way back to the explanation of the very thing they were being
## asked.
##
## So the lesson for wherever this child stands in this question's category is
## permanently one tap away, and asking costs nothing -- no mark, no record, no
## effect on what the ladder thinks they know. It opens OVER the board (layer 11
## against 10) and the question is untouched underneath, because a child who
## looks something up has not answered anything yet.
##
## Absent rather than dead when the rung has no authored lesson: a button that
## does nothing teaches a child that buttons do nothing.
func _add_help_button(row: HBoxContainer) -> void:
	# Keyed on the PROBLEM, not the child's ladder position. 70% of questions come
	# from a rung the child is not standing on (comfort, review and stretch lanes
	# together), and a relational problem is claimed by an overlay that a rung
	# lookup cannot reach at all -- see TutorialManager.lesson_for_problem.
	if TutorialManager.lesson_for_problem(current_problem).is_empty():
		return
	var help := BrandButton.make(TextManager.t("math.help"), BrandButton.Role.GHOST,
		_open_help)
	var size := float(Config.ui("math_challenge/help_button_size", 88))
	help.custom_minimum_size = Vector2(size, size)
	help.add_theme_font_size_override("font_size", int(Config.ui("math_challenge/help_font_size", 30)))
	help.tooltip_text = TextManager.t("math.help_tooltip")
	# Not focusable, alone among BrandButtons. Enter is the board's commit key
	# (see _unhandled_input), and a focused button eats ui_accept before any of
	# this node's input handlers see it -- so a "?" holding focus would turn every
	# Enter meant for an answer into a lesson opening instead. The board has one
	# keyboard action, and this is not it.
	help.focusable = false
	row.add_child(help)

func _open_help() -> void:
	var lesson := TutorialManager.lesson_for_problem(current_problem)
	if lesson.is_empty():
		return
	var game := _game()
	if game == null:
		return
	# BRIEF, always. A child pressing this is not meeting the idea, they are
	# checking one thing about it, and the four-card arc starts two cards before
	# the part they came for.
	#
	# Not marked seen either, here or on close: looking something up is not being
	# taught it, and recording it would silence the automatic lesson for a rung
	# the child never actually got.
	game.launch_math_tutorial(lesson, func(_payload: Dictionary): pass,
		TutorialManager.DEPTH_BRIEF, true)

## The Game hosting this board. Walked rather than held, because the overlay is
## added to whatever opened it and nothing guarantees a fixed depth.
func _game() -> Node:
	var n: Node = get_parent()
	while n != null:
		if n.has_method("launch_math_tutorial"):
			return n
		n = n.get_parent()
	return null

## The board's surface. Themed roles rather than fixed colours, so each world
## brings its own slate - and swappable for a nine-slice texture the day one is
## drawn, without touching this file (brand/ASSET_MANIFEST.md P1).
##
## Three sources, most specific first:
##
##   1. the active world's own `mathBoard.frameSprite` (theme_*.json)
##   2. the registry's shared `board_panel` slot
##   3. the drawn StyleBoxFlat below
##
## The theme slot is first because it is the only one that can make Emberwood
## and Geyserworks different MATERIALS rather than the same rounded rectangle in
## two browns, which is what brand/BRAND_SYSTEM.md §8.3 asks for. Every theme
## file has declared `mathBoard.frameSprite` since the palettes were written and
## nothing read it: this used to check one global key, so the day the five PNGs
## landed all five worlds would still have shared one board and the slots would
## have looked wired while doing nothing.
func _board_face() -> StyleBox:
	var texture_path := String(Config.ui("math_challenge/board_texture", ""))
	var panel: Texture2D = null
	var themed := String((ThemeManager.get_theme().get("mathBoard", {}) as Dictionary).get("frameSprite", ""))
	if texture_path != "" and ResourceLoader.exists(texture_path):
		panel = load(texture_path)
	elif themed != "" and SpriteSheet.has_art(themed):
		panel = SpriteSheet.texture(themed)
	elif SpriteSheet.has_art("board_panel"):
		panel = SpriteSheet.texture("board_panel")
	if panel != null:
		var nine := StyleBoxTexture.new()
		nine.texture = panel
		nine.set_texture_margin_all(int(Config.ui("math_challenge/board_texture_inset", 24)))
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

## Where an option currently sits on screen.
##
## submit_answer() takes an index into answer.options, but the row is shuffled
## every time it is built, so the two are not the same number. Marking
## _buttons[index] would light up whichever option happens to occupy that slot -
## a wrong answer colouring a different button than the one a child pressed.
func _display_index(value_index: int) -> int:
	return _display_order.find(value_index)

func _mark(value_index: int, state: int) -> void:
	var at := _display_index(value_index)
	if at >= 0 and at < _buttons.size():
		_buttons[at].set_state(state)

func _shake(value_index: int) -> void:
	var at := _display_index(value_index)
	if at >= 0 and at < _buttons.size():
		_buttons[at].shake()

## Colour the option that was right. Runs with main's _reveal_answer(), which
## supplies the words: colour alone would fail Gate B6.
func _mark_correct_option() -> void:
	var answer: Dictionary = current_problem.get("answer", {})
	var options: Array = answer.get("options", [])
	for i in options.size():
		if str(options[i]) == str(answer.get("correct", null)):
			_mark(i, AnswerButton.State.RIGHT)
			return

func _pop_in(node: Control) -> void:
	if is_instance_valid(node):
		UiFx.elastic_entrance(node)

## Deliberately no progress pips on the board.
##
## Three small circles used to sit under the owl's greeting: wins banked toward
## the next curriculum step, filled or outlined. Nothing on screen said so. A
## row of dots with no label, on the one surface where a five-year-old is
## already holding a question in their head, is a second thing to decode before
## the first one -- and a child who does decode it learns that two of three
## answers "do not count", which is the opposite of what the ladder means.
##
## The step-up is still celebrated, where a celebration belongs and where it
## reads without a legend: hud.gd's banner on EventBus.curriculum_step_up. Wins
## banked toward the next step belong to the grown-up surface, and
## ui/parent_report.gd is where a parent already goes for them.

## Disabled options have to LOOK disabled.
##
## Godot greys a disabled Button through its theme, but these carry a StyleBoxFlat
## override per state, so the disabled look never showed: the options stayed fully
## lit and tappable-looking while input was held, and a child who tapped again got
## silence with no reason for it.
##
## `self_modulate`, NOT `modulate`. UiFx.attach_focus_highlight tweens `modulate`
## on focus and back to Color.WHITE on blur, so dimming through the same property
## left the focused option lit while its three neighbours faded -- caught by
## test_answer_feedback.gd as "3 dimmed, 1 still lit". The two properties
## multiply, so on separate ones they compose instead of fighting.
const LOCKED_ALPHA := 0.45


func _set_buttons_enabled(enabled: bool) -> void:
	for b in _buttons:
		b.disabled = not enabled
		b.self_modulate = Color(1, 1, 1, 1.0 if enabled else LOCKED_ALPHA) # hardcode-ok

func _close() -> void:
	closed.emit()
	queue_free()


## Retitle an open overlay when the locale changes.
##
## Re-renders from `current_problem` and never asks for a new one -- swapping the
## problem under a child mid-answer because they changed language would be a
## genuinely bad bug. Mirrors MathBoard.onLocaleChanged in the web build.
func _on_locale_changed() -> void:
	if current_problem.is_empty():
		return
	if _question_label != null:
		_question_label.text = _localised("prompt")
	if _hint_label != null and _hint_label.visible:
		var text := _localised("explanation")
		if text.is_empty():
			text = _localised("hint")
		if not text.is_empty():
			_hint_label.text = text


## One of the problem's three sentences, in the active locale.
##
## The rule itself lives in MathPhrasing, because the grown-up report renders the
## same sentences now and there must be exactly one fallback chain.
func _localised(field: String) -> String:
	return MathPhrasing.localise(current_problem, field)
