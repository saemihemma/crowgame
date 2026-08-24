extends TestCase
## The counting-prompt rule. It reads a count back out of prompt text, so it has
## to be strict in both directions: every one of the curriculum's 121 counting
## problems must be recognised, and no ordinary question may be mistaken for one
## and have its text truncated at a colon.

const CURRICULUM := "res://data/math/problems_curriculum.json"

func _reset() -> void:
	_failures.clear()
	_assertions = 0

func test_reads_every_marker_the_curriculum_uses() -> void:
	# All twelve, since the authors cycled through them rather than settling.
	for marker in ["?", "o", "*", "#", "+", "x", "@", "%", "&", "^", "$", "!"]:
		var text := "Count these: %s %s %s" % [marker, marker, marker]
		assert_eq(CountRow.tokens_in(text), 3, "'%s' run of three counts as three" % marker)

func test_counts_runs_of_every_length() -> void:
	assert_eq(CountRow.tokens_in("Count these: o"), 1, "a single token counts")
	var long := "How many are here:"
	for i in 19:
		long += " *"
	assert_eq(CountRow.tokens_in(long), 19, "the longest run in the pool counts")

## The destructive failure: a mis-detection truncates the question at its colon,
## so the child is shown a prompt with the actual question removed.
func test_leaves_ordinary_prompts_alone() -> void:
	for text in [
		"What is 3 + 2?",
		"Quick check: 3 + 2",
		"Which is bigger: 7 or 4",
		"Count these: 5",
		"Fill in: 2, 4, 6, ?",
		"Sort these: apples and pears",
		"",
		"No colon here at all",
	]:
		assert_eq(CountRow.tokens_in(text), 0, "'%s' is not a counting prompt" % text)

## Mixed symbols are not a run of one thing, so nothing is countable.
func test_rejects_mixed_markers() -> void:
	assert_eq(CountRow.tokens_in("Count these: * o *"), 0, "mixed markers do not count")

## The real pool is the only thing that proves the rule is worth having: if it
## recognises none of them, every counting problem is still rendered as text.
func test_matches_the_real_curriculum() -> void:
	var f := FileAccess.open(CURRICULUM, FileAccess.READ)
	assert_true(f != null, "curriculum is readable")
	if f == null:
		return
	var data: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	var problems: Array = data["problems"] if typeof(data) == TYPE_DICTIONARY and data.has("problems") else data
	var counting := 0
	var recognised := 0
	var false_positives := 0
	for p in problems:
		var text := String(p.get("prompt", {}).get("text", ""))
		var tokens := CountRow.tokens_in(text)
		var is_counting := String(p.get("domain", "")) == "counting"
		if is_counting:
			counting += 1
			if tokens > 0:
				recognised += 1
				# The run has to say the same number the answer does, or the
				# child is counting objects toward the wrong total.
				assert_eq(tokens, int(p.get("answer", {}).get("correct", -1)),
					"'%s' shows as many tokens as its answer" % text)
		elif tokens > 0:
			false_positives += 1
	assert_true(counting > 0, "the pool has counting problems")
	assert_eq(false_positives, 0, "no non-counting problem is read as one")
	assert_eq(recognised, counting, "every counting problem renders as objects")
