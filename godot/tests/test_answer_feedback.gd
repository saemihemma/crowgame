extends TestCase
## Answer-feedback pacing, and the fact that a held control looks held.
##
## The two ports used to disagree about how long a child waits after a wrong
## answer: the web hardcoded 600/1500/3000 while this port read its own separate
## values from ui_tuning.json. Neither set had been chosen on purpose. They now
## come from data/tuning/math_tuning.json, which both ports read and which the
## content validator holds byte-identical between the two mirrors.

const MATH_CHALLENGE := preload("res://scenes/MathChallenge.tscn")


func _tuning() -> Dictionary:
	return DataManager.get_dict("MATH_TUNING")


func test_the_feedback_pacing_lives_in_the_shared_tuning_file() -> void:
	var feedback: Variant = _tuning().get("feedback", null)
	assert_true(feedback is Dictionary,
		"math_tuning.json carries a `feedback` block — without it both ports fall "
		+ "back to their own literals and drift apart again")
	if not (feedback is Dictionary):
		return
	for key in ["retryLockoutMs", "correctCloseMs", "revealCloseMs"]:
		assert_true((feedback as Dictionary).has(key), "feedback.%s is tuned" % key)
		assert_true(float((feedback as Dictionary).get(key, 0)) > 0.0,
			"feedback.%s is a positive duration" % key)


## The retry lockout has to outlast the feedback it is covering, or a child taps
## into an animation and gets silence -- which is the complaint that started this.
func test_the_retry_lockout_is_long_enough_to_cover_its_own_feedback() -> void:
	var feedback: Dictionary = _tuning().get("feedback", {})
	var lockout := float(feedback.get("retryLockoutMs", 0))
	assert_true(lockout >= 800.0,
		"the retry lockout (%.0fms) covers the wrong-answer tint, the fly-up and "
		% lockout + "the hint fading in")
	assert_true(lockout <= 1500.0,
		"but is not so long that a child who is ready to retry is left waiting "
		+ "(got %.0fms)" % lockout)


## A control that looks tappable and is not is the worst of both. These buttons
## carry a StyleBoxFlat override per state, so Godot's built-in disabled styling
## never showed -- the dimming has to be explicit. It also has to use
## `self_modulate`: the focus highlight owns `modulate`, and this test caught the
## first attempt leaving the focused option lit while its neighbours faded.
func test_disabled_options_are_visibly_dimmed() -> void:
	var panel: Node = MATH_CHALLENGE.instantiate()
	Engine.get_main_loop().root.add_child(panel)
	panel.present({
		"id": "feedback_probe",
		"domain": "addition",
		"prompt": {"text": "1 + 1 = ?"},
		"answer": {"mode": "mcq", "correct": 2, "options": [2, 3, 4, 5]},
	})
	await Engine.get_main_loop().process_frame

	panel._set_buttons_enabled(false)
	await Engine.get_main_loop().process_frame
	var dimmed := 0
	var lit := 0
	for b: Button in panel._buttons:
		if b.self_modulate.a < 1.0:
			dimmed += 1
		else:
			lit += 1
	assert_true(dimmed > 0 and lit == 0,
		"every option dims while input is held (%d dimmed, %d still lit)" % [dimmed, lit])

	panel._set_buttons_enabled(true)
	await Engine.get_main_loop().process_frame
	var restored := 0
	for b: Button in panel._buttons:
		if is_equal_approx(b.self_modulate.a, 1.0):
			restored += 1
	assert_eq(restored, panel._buttons.size(),
		"and they come back to full opacity when they are live again")

	panel.queue_free()
	await Engine.get_main_loop().process_frame


# --- the keyboard route to an answer ---------------------------------------
#
# A playtester on a PC could not answer with the keys a PC player reaches for.
# The board took digits only, which was a deliberate choice made after focus-based
# arrow navigation let the game answer its own first question -- so the route back
# is a mark the board owns, moved by actions the board names, committed by a key
# that is not also jump.

func _board() -> Node:
	var panel: Node = MATH_CHALLENGE.instantiate()
	Engine.get_main_loop().root.add_child(panel)
	panel.present({
		"id": "keyboard_probe",
		"domain": "addition",
		"prompt": {"text": "1 + 1 = ?"},
		"answer": {"mode": "mcq", "correct": 2, "options": [2, 3, 4, 5]},
	}, {"npcName": "Hoot", "npcGreeting": "Hi", "problemCount": 1, "currentProblemIndex": 1})
	return panel

## The three actions exist. Without them `is_action_pressed` throws at runtime
## on the one screen a child cannot walk away from.
func test_the_board_names_its_keyboard_actions() -> void:
	for action in ["answer_prev", "answer_next", "answer_confirm"]:
		assert_true(InputMap.has_action(action), "input action %s" % action)

## Enter, and the keypad's Enter. NOT Space: Space is `jump`, and the whole
## reason the first keyboard route was torn out is that jump could commit an
## answer.
func test_confirm_is_enter_and_never_space() -> void:
	var keys: Array = []
	for event in InputMap.action_get_events("answer_confirm"):
		if event is InputEventKey:
			keys.append(int((event as InputEventKey).physical_keycode))
	assert_true(keys.has(KEY_ENTER), "Enter commits the marked answer")
	assert_true(keys.has(KEY_KP_ENTER), "and so does the keypad's Enter")
	assert_true(not keys.has(KEY_SPACE), "Space is jump, and jump never answers")

## Nothing is marked until a child asks for a mark. A touch player must never
## see a selection they did not make.
func test_a_fresh_board_marks_nothing() -> void:
	var panel := _board()
	await Engine.get_main_loop().process_frame
	assert_eq(panel._cursor.at, -1, "no option is marked before an arrow is pressed")
	for b: AnswerButton in panel._buttons:
		assert_true(not b._selected, "and no option is drawn as selected")
	panel.queue_free()
	await Engine.get_main_loop().process_frame

## Right lands on the leftmost option, then walks the row and wraps.
func test_the_mark_walks_the_row_and_wraps() -> void:
	var panel := _board()
	await Engine.get_main_loop().process_frame
	var count: int = panel._buttons.size()
	assert_eq(count, 4, "four options to walk")

	panel._move_cursor(1)
	assert_eq(panel._cursor.at, 0, "the first press lands on the leftmost option")
	panel._move_cursor(1)
	assert_eq(panel._cursor.at, 1, "and the next moves one right")
	for _i in count:
		panel._move_cursor(1)
	assert_eq(panel._cursor.at, 1, "a full lap comes back to where it started")
	panel._move_cursor(-1)
	assert_eq(panel._cursor.at, 0, "and left walks back")
	panel._move_cursor(-1)
	assert_eq(panel._cursor.at, count - 1, "off the left edge wraps to the last option")

	var marked := 0
	for b: AnswerButton in panel._buttons:
		if b._selected:
			marked += 1
	assert_eq(marked, 1, "exactly one option is ever marked")
	panel.queue_free()
	await Engine.get_main_loop().process_frame

## Confirm with no mark does nothing at all. A leaned-on key must not be able to
## commit the one irreversible action on the screen.
func test_confirming_nothing_answers_nothing() -> void:
	var panel := _board()
	await Engine.get_main_loop().process_frame
	panel._commit_cursor()
	await Engine.get_main_loop().process_frame
	assert_true(panel.is_active(), "the question is still open")
	panel.queue_free()
	await Engine.get_main_loop().process_frame

## And with a mark, Enter answers the option under it -- the option a child can
## SEE is marked, which is the shuffled row position, not the pool's index.
func test_confirm_answers_the_marked_option() -> void:
	var panel := _board()
	await Engine.get_main_loop().process_frame
	panel._move_cursor(1)
	var at: int = panel._cursor.at
	panel._commit_cursor()
	await Engine.get_main_loop().process_frame
	# The board answers by marking the option it took, so the mark tells us which
	# one Enter submitted -- through the same shuffle the mouse path goes through.
	for i in panel._buttons.size():
		var answered: bool = (panel._buttons[i] as AnswerButton)._state != AnswerButton.State.IDLE
		if i == at:
			assert_true(answered, "Enter submitted the option the mark was standing on")
		else:
			assert_true(not answered, "and no other option was touched")
	panel.queue_free()
	await Engine.get_main_loop().process_frame

## The "?" is the one BrandButton on the board that cannot hold focus. A focused
## button eats ui_accept before this node's handlers run, so a focusable "?"
## would turn every Enter meant for an answer into a lesson opening.
func test_the_help_button_cannot_hold_focus() -> void:
	var panel := _board()
	await Engine.get_main_loop().process_frame
	var checked := 0
	for node in _all_children(panel):
		if node is BrandButton:
			assert_eq(int((node as BrandButton).focus_mode), int(Control.FOCUS_NONE),
				"nothing on the board takes the focus Enter would land on")
			checked += 1
	assert_true(checked >= 1,
		"the board carries the '?' this is about (%d focusable candidates)" % checked)
	panel.queue_free()
	await Engine.get_main_loop().process_frame

func _all_children(node: Node) -> Array:
	var out: Array = []
	for child in node.get_children():
		out.append(child)
		out.append_array(_all_children(child))
	return out
