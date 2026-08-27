extends TestCase
## Where a child starts, and how fast the game admits it guessed wrong.
##
## Placement is the one part of the maths experience a child never sees working:
## it happens before the first question and inside the first three answers, so
## the only evidence it is right is a test. These lock the rules that matter --
## the Icelandic grade rule, the refusal to seed a pre-schooler, the refusal to
## seed over measured play, and the fact that the window moves in both
## directions.

const AUG := {"year": 2026, "month": 8, "day": 26}
const JUN := {"year": 2026, "month": 6, "day": 1}


# --- the grade rule -------------------------------------------------------

## Lög um grunnskóla nr. 91/2008, 15. gr.: school starts in the calendar year the
## child turns six. Birth year alone, no birth date -- which is also why the
## account only ever asks for a year.
func test_grade_comes_from_the_birth_year_and_the_school_year() -> void:
	assert_eq(MathPlacement.grade_for(2019, AUG), 2, "born 2019 is in 2. bekkur in autumn 2026")
	assert_eq(MathPlacement.grade_for(2020, AUG), 1, "born 2020 is in 1. bekkur in autumn 2026")
	assert_eq(MathPlacement.grade_for(2021, AUG), 0, "born 2021 has not started school")


## June is before the school-year boundary, so a child is still in the grade they
## just finished rather than the one they are about to start. Expectations over
## the summer stay honest instead of jumping a grade in August's absence.
func test_the_school_year_boundary_holds_a_child_in_the_grade_they_finished() -> void:
	assert_eq(MathPlacement.grade_for(2020, JUN), 0,
		"in June 2026 a child born in 2020 has not started 1. bekkur yet")
	assert_eq(MathPlacement.grade_for(2019, JUN), 1,
		"and one born in 2019 is still finishing 1. bekkur")


## No birth year on the profile is the common case, and it must cost nothing.
func test_no_birth_year_is_not_a_grade() -> void:
	assert_eq(MathPlacement.grade_for(0, AUG), 0, "an unknown birth year is not a claim")


# --- the seed -------------------------------------------------------------

## Aðalnámskrá leikskóla defines NO mathematics criteria, so there is nothing a
## pre-school child is behind on and no floor to stand them on. Seeding one
## anyway would be inventing an expectation the Icelandic curriculum declines to
## make.
func test_a_pre_school_child_is_seeded_nothing() -> void:
	assert_true(MathPlacement.seed_steps(0).is_empty(), "leikskóli seeds nothing")
	assert_true(MathPlacement.seed_steps(-1).is_empty(), "and neither does anything below it")


## A 1. bekkur child has finished leikskóli, which expects nothing, so there is
## still nothing to seed from. The first real seed is for 2. bekkur.
func test_the_first_seed_is_for_a_child_who_has_finished_a_grade() -> void:
	assert_true(MathPlacement.seed_steps(1).is_empty(),
		"1. bekkur has only finished leikskóli, which sets no expectations")
	var second := MathPlacement.seed_steps(2)
	assert_true(not second.is_empty(), "2. bekkur has finished 1. bekkur, which does")
	assert_true(second.has("addition"), "and 1. bekkur covers addition within 20")


## The seed lands BELOW the rung the grade tables expect, not on it. Opening the
## game on the hardest thing a child is supposed to know is how a confident child
## quits in the first minute; the calibration window climbs back out in one
## answer if this was too cautious.
func test_the_seed_backs_off_from_the_expected_rung() -> void:
	var steps := MathPlacement.seed_steps(2)
	var expected := _expected_step("addition", 1)
	assert_true(expected > 0, "the grade tables carry an end-of-1.-bekkur addition milestone")
	assert_eq(int(steps.get("addition", -1)), expected - MathPlacement.SEED_BACKOFF_STEPS,
		"addition seeds SEED_BACKOFF_STEPS below what 1. bekkur is expected to finish")


## Multiplication and division are introduced in 3. bekkur (Sproti 3). A child
## who has finished 1. bekkur has met neither, so neither is seeded -- the seed
## reads the grade tables rather than assuming every domain starts everywhere.
func test_domains_a_child_has_not_met_are_not_seeded() -> void:
	var steps := MathPlacement.seed_steps(2)
	assert_true(not steps.has("multiplication"), "multiplication is a 3. bekkur idea")
	assert_true(not steps.has("division"), "and so is division")


## maxOperand is 20 in math_challenge_component: the Icelandic first-year number
## range, and the declared edge of who this game is for. A child old enough to be
## past it gets the same seed as the oldest child the game actually serves,
## because seeding into content the selector cannot draw would strand them on an
## empty rung.
func test_the_seed_stops_at_the_audience_ceiling() -> void:
	var top := MathPlacement.seed_steps(MathPlacement.MAX_SEEDED_GRADE)
	for grade in [MathPlacement.MAX_SEEDED_GRADE + 1, 7, 10]:
		assert_eq(MathPlacement.seed_steps(grade), top,
			"grade %d is seeded no further than the audience ceiling" % grade)


# --- applying the seed to a real snapshot ---------------------------------

func test_the_seed_raises_an_untouched_domain() -> void:
	var seeded := MathPlacement.seed_snapshot(_snapshot(0, 0), {"addition": 13})
	assert_eq(int(seeded["curriculumProgress"]["addition"]["currentStep"]), 13, "seeded to 13")


## main_menu.gd awards the trophy shelf off highestStep, gated only on having
## answered something at all. If the seed raised it, a 2. bekkur child would
## collect the top trophy in every domain for their first correct answer -- a
## reward for a birth year. The seed says where to START, never what was earned.
func test_the_seed_does_not_hand_out_trophies() -> void:
	var seeded := MathPlacement.seed_snapshot(_snapshot(0, 0), {"addition": 13})
	assert_eq(int(seeded["curriculumProgress"]["addition"]["highestStep"]), 0,
		"highestStep is untouched by the seed")
	# A calibration move IS paid for with an answer, so that one may raise it.
	var placed := MathPlacement.place_snapshot(_snapshot(0, 1), "addition", 6)
	assert_eq(int(placed["curriculumProgress"]["addition"]["highestStep"]), 6,
		"but a rung reached by answering is earned, and counts")


## A measured position always outranks a guess from a birth year. A child who has
## answered anything keeps the rung they earned, in either direction.
func test_the_seed_never_overrides_play() -> void:
	var played := MathPlacement.seed_snapshot(_snapshot(4, 9), {"addition": 13})
	assert_eq(int(played["curriculumProgress"]["addition"]["currentStep"]), 4,
		"a child who has answered 9 questions is not re-placed by their birth year")
	var ahead := MathPlacement.seed_snapshot(_snapshot(20, 0), {"addition": 13})
	assert_eq(int(ahead["curriculumProgress"]["addition"]["currentStep"]), 20,
		"and the seed only ever raises, so it cannot pull a child backwards")


# --- the calibration window -----------------------------------------------

func test_the_window_is_the_first_few_answers_only() -> void:
	assert_true(MathPlacement.is_calibrating(0), "a child with no answers is being placed")
	assert_true(not MathPlacement.is_calibrating(MathPlacement.CALIBRATION_ATTEMPTS),
		"and stops being placed once the window is spent")


## The whole point: inside the window one answer moves one whole CONCEPT, not one
## step. At +/-1 step a mis-seeded child would need roughly thirty questions to
## reach the right rung, which is thirty questions of being bored or lost.
func test_a_first_try_win_moves_a_whole_concept_forward() -> void:
	var from := 0
	var to := MathPlacement.calibrated_step("addition", from, true, true)
	assert_true(to > from, "a first-try win moves up (got %d from %d)" % [to, from])
	assert_eq(to, ConceptLadder.next_concept_step("addition", from),
		"and lands on the next concept's first rung, not the next step")


func test_a_miss_moves_a_whole_concept_back() -> void:
	var from := ConceptLadder.next_concept_step("addition", 0)
	var to := MathPlacement.calibrated_step("addition", from, false, false)
	assert_true(to < from, "a miss moves down (got %d from %d)" % [to, from])


## A win on the second try is evidence the rung is about right, which is exactly
## where a placement wants to stop. Moving on it would overshoot a child who is
## already where they belong.
func test_a_retry_win_holds_position() -> void:
	assert_eq(MathPlacement.calibrated_step("addition", 6, true, false), 6,
		"a retry win neither promotes nor demotes")


## Placement moves WHERE a child is, never the record of what they answered.
func test_placing_resets_the_banked_wins_and_keeps_the_history() -> void:
	var before := _snapshot(3, 5)
	before["curriculumProgress"]["addition"]["winsAtCurrentStep"] = 2
	var after := MathPlacement.place_snapshot(before, "addition", 10)
	var d: Dictionary = after["curriculumProgress"]["addition"]
	assert_eq(int(d["currentStep"]), 10, "moved")
	assert_eq(int(d["winsAtCurrentStep"]), 0,
		"wins banked toward leaving the old rung do not follow to the new one")
	assert_eq(int(d["totalAttempts"]), 5, "but the attempt history is untouched")


# --- helpers ---------------------------------------------------------------

func _expected_step(domain: String, end_of_grade: int) -> int:
	var domains: Dictionary = DataManager.get_dict("GRADE_EXPECTATIONS").get("domains", {})
	for m in (domains.get(domain, []) as Array):
		if int((m as Dictionary).get("endOfGrade", -1)) == end_of_grade:
			return int((m as Dictionary).get("step", 0))
	return 0


func _snapshot(step: int, attempts: int) -> Dictionary:
	return {
		"curriculumProgress": {
			"addition": {
				"currentStep": step, "highestStep": step, "winsAtCurrentStep": 0,
				"recentStepResults": [], "totalAttempts": attempts,
			},
		},
	}
