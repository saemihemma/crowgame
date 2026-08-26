extends TestCase
## What a wrong answer is allowed to claim about the child who gave it.
##
## The rule is deliberately narrow, and narrowness is the thing worth testing:
## a hint that says "so close, count once more" to a child who was out by seven
## tells them their thinking was nearly right when it was not, which is worse
## than the generic hint it replaced.
##
## Two halves have to agree before a miss is named. The arithmetic has to
## identify the confusion, AND the author has to have declared that this problem
## can produce it.

func _reset() -> void:
	_failures.clear()
	_assertions = 0


func _problem(correct: Variant, tags: Array) -> Dictionary:
	return {"id": "probe", "domain": "addition", "misconceptionTags": tags,
		"answer": {"mode": "mcq", "correct": correct, "options": []}}


# --- what it names ---------------------------------------------------------

func test_out_by_one_is_named_when_the_author_declared_it() -> void:
	var p := _problem(8, ["off_by_one"])
	assert_eq(MathMisconception.identify(p, 7), "off_by_one", "one under")
	assert_eq(MathMisconception.identify(p, 9), "off_by_one", "one over")


## A problem about counting back that was missed by one is a counting-back slip.
## Saying that is more use than "off by one", so it wins where both are declared.
func test_the_more_specific_tag_wins() -> void:
	var p := _problem(8, ["off_by_one", "counting_back_error"])
	assert_eq(MathMisconception.identify(p, 7), "counting_back_error",
		"the confusion the problem is about beats the generic distance")


func test_out_by_ten_is_a_place_value_slip() -> void:
	assert_eq(MathMisconception.identify(_problem(24, ["place_value_slip"]), 34),
		"place_value_slip", "ten over")
	assert_eq(MathMisconception.identify(_problem(24, ["forgot_carry"]), 14),
		"forgot_carry", "and names the carry when that is what was declared")


func test_a_factor_of_ten_is_a_magnitude_slip() -> void:
	assert_eq(MathMisconception.identify(_problem(30, ["magnitude_slip"]), 300),
		"magnitude_slip", "ten times too big")
	assert_eq(MathMisconception.identify(_problem(30, ["magnitude_slip"]), 3),
		"magnitude_slip", "ten times too small")


func test_reversed_digits_are_a_place_value_read() -> void:
	assert_eq(MathMisconception.identify(_problem(12, ["place_value_slip"]), 21),
		"place_value_slip", "same digits, wrong way round")


# --- what it refuses to name -----------------------------------------------

## The whole point. An unrecognisable miss falls back to the authored hint.
func test_a_miss_it_cannot_explain_is_not_explained() -> void:
	assert_eq(MathMisconception.identify(_problem(8, ["off_by_one"]), 1), "",
		"out by seven is not an off-by-one")
	assert_eq(MathMisconception.identify(_problem(8, ["off_by_one"]), 15), "",
		"nor is out by seven the other way")


## The author's list is the authority on what a problem can produce. Recognising
## the distance is not permission to invent the confusion.
func test_an_undeclared_confusion_is_never_claimed() -> void:
	assert_eq(MathMisconception.identify(_problem(8, ["equal_groups_confusion"]), 7), "",
		"out by one, but this problem is not about being out by one")
	assert_eq(MathMisconception.identify(_problem(8, []), 7), "",
		"a problem with no tags claims nothing")


func test_the_right_answer_is_not_a_misconception() -> void:
	assert_eq(MathMisconception.identify(_problem(8, ["off_by_one"]), 8), "",
		"a correct answer identifies nothing")


func test_non_numeric_answers_are_left_alone() -> void:
	var p := {"answer": {"correct": "more"}, "misconceptionTags": ["comparison_confusion"]}
	assert_eq(MathMisconception.identify(p, "fewer"), "",
		"the rule is arithmetic, so a worded answer is out of its reach")


# --- the strings behind it -------------------------------------------------

## Every tag the rule can return needs a sentence in every locale, or a child
## reaches the one moment they need help and sees a raw key.
func test_every_nameable_tag_has_a_hint_in_both_languages() -> void:
	var nameable: Array = []
	for tag in MathMisconception.BY_ONE_TAGS:
		nameable.append(tag)
	for tag in MathMisconception.BY_TEN_TAGS:
		nameable.append(tag)
	nameable.append("magnitude_slip")
	nameable.append("place_value_slip")

	var before := TextManager.get_locale()
	for locale in TextManager.available_locales():
		TextManager.set_locale(String(locale))
		for tag in nameable:
			var key := "math.miss.%s" % tag
			assert_true(TextManager.t(key) != key,
				"%s: [%s] is translated" % [locale, key])
	TextManager.set_locale(before)


## Anything the rule names must be reachable from real content, or the rule is
## describing problems nobody authored.
func test_every_nameable_tag_appears_on_a_real_problem() -> void:
	var seen := {}
	for problem: Variant in DataManager.get_all_math_problems():
		for tag: Variant in (problem as Dictionary).get("misconceptionTags", []):
			seen[String(tag)] = true
	for tag in MathMisconception.BY_ONE_TAGS:
		assert_true(seen.has(tag), "some authored problem declares '%s'" % tag)
	for tag in MathMisconception.BY_TEN_TAGS:
		assert_true(seen.has(tag), "some authored problem declares '%s'" % tag)
