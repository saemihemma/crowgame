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
