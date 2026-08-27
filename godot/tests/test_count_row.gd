extends TestCase
## The counting-prompt rule. It reads a count back out of prompt text, so it has
## to be strict in both directions: every counting problem in the pools must be
## recognised, and no ordinary question may be mistaken for one and have its text
## truncated at its separator.

const CURRICULUM := "res://data/math/problems_curriculum.json"
const EASY := "res://data/math/problems_easy.json"

## The marker alphabet, and the shape each one is supposed to draw. This is the
## Godot half of a pair: the other half is COUNTING_MARKERS in
## tools/math_authoring.ts, which is what writes the prompts. A prompt that says
## "How many hearts?" over a row of drawn discs is worse than one that names
## nothing, and the only thing holding the two files together is this test.
const MARKER_SHAPES := {
	"o": "disc", "@": "ring", "#": "square", "%": "diamond",
	"&": "leaf", "*": "flower", "^": "star", "<": "triangle",
	"~": "hexagon", ";": "heart", "(": "egg", ")": "crescent",
}

## What each shape-naming prompt key claims is on the board. Keys from
## tools/math_phrasing_catalog.mjs; the nouns are the English ones, and the
## Icelandic translations are held to the same key by the i18n lockstep guard.
const SHAPE_BY_PROMPT_NOUN := {
	"dots": "disc", "rings": "ring", "squares": "square", "diamonds": "diamond",
	"leaves": "leaf", "flowers": "flower", "stars": "star", "triangles": "triangle",
	"hexagons": "hexagon", "hearts": "heart", "eggs": "egg", "moons": "crescent",
}


func test_reads_every_marker_in_the_alphabet() -> void:
	for marker in MARKER_SHAPES:
		var text := "Count these: %s %s %s" % [marker, marker, marker]
		assert_eq(CountRow.tokens_in(text), 3, "'%s' run of three counts as three" % marker)

## The retired markers are still read, because a save or a protected pool can
## still carry a prompt that used one.
func test_still_reads_the_markers_the_alphabet_dropped() -> void:
	for marker in ["?", "+", "x", "!", "$", "O", "X", ">"]:
		var text := "Count these: %s %s" % [marker, marker]
		assert_eq(CountRow.tokens_in(text), 2, "'%s' is still readable" % marker)

## Every marker in the alphabet draws its own shape -- twelve markers, twelve
## shapes, no two sharing. Shape variety at the bottom of the ladder is the whole
## reason the alphabet is twelve wide, so a collision here is a silent loss of it.
func test_every_marker_draws_its_own_shape() -> void:
	var seen := {}
	for marker in MARKER_SHAPES:
		var shape := CountRow.shape_for(marker)
		assert_eq(shape, String(MARKER_SHAPES[marker]),
			"'%s' draws a %s" % [marker, MARKER_SHAPES[marker]])
		assert_true(not seen.has(shape), "%s is drawn by only one marker" % shape)
		seen[shape] = true
	assert_eq(seen.size(), MARKER_SHAPES.size(), "every marker has a distinct shape")

## A prompt that NAMES a shape must be drawn as that shape. Checked on the real
## pools, in English, because the English caption is what the phrasing key was
## derived from and the Icelandic is pinned to the same key.
func test_named_shapes_match_what_is_drawn() -> void:
	var checked := 0
	for path in [CURRICULUM, EASY]:
		for p in _problems(path):
			var text := String(p.get("prompt", {}).get("text", ""))
			if CountRow.tokens_in(text) <= 0:
				continue
			var caption := CountRow.caption_in(text).to_lower()
			for noun in SHAPE_BY_PROMPT_NOUN:
				if not caption.contains(String(noun)):
					continue
				checked += 1
				assert_eq(CountRow.shape_for(CountRow.marker_in(text)),
					String(SHAPE_BY_PROMPT_NOUN[noun]),
					"'%s' draws the %s it names" % [text, noun])
	assert_true(checked > 0, "the pools name shapes in their counting prompts")

## The caption is what survives once the row is drawn underneath it. A colon
## introduced the run and goes with it; a question mark is part of the question.
func test_caption_keeps_the_question_and_drops_the_run() -> void:
	assert_eq(CountRow.caption_in("Count the leaves: & & &"), "Count the leaves")
	assert_eq(CountRow.caption_in("How many stars? ^ ^ ^"), "How many stars?")
	assert_eq(CountRow.caption_in("How many are here: ? ? ?"), "How many are here")
	assert_eq(CountRow.caption_in("What is 3 + 2?"), "What is 3 + 2?",
		"a prompt with nothing countable in it is returned whole")

## A caption with no colon at all still finds its run. The easy pool ships
## "How many stars? ^ ^ ^ ^ ^" and its Icelandic translation has no colon either,
## so a colon-only rule rendered five literal carets to the child -- the exact
## typography CountRow exists to remove.
func test_reads_a_run_after_a_question_mark() -> void:
	assert_eq(CountRow.tokens_in("How many stars? ^ ^ ^ ^ ^"), 5)
	assert_eq(CountRow.marker_in("How many stars? ^ ^ ^ ^ ^"), "^")
	assert_eq(CountRow.tokens_in("Hvad eru stjornurnar margar? ^ ^ ^"), 3,
		"the same rule in the other locale")

## ...and a "?" that is only punctuation is not mistaken for a separator.
func test_question_mark_alone_is_not_a_run() -> void:
	for text in [
		"What comes after 7?",
		"What number comes next? 1, 2, 3, ?",
		"How much is 3 + 2?",
	]:
		assert_eq(CountRow.tokens_in(text), 0, "'%s' is not a counting prompt" % text)

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

static func _problems(path: String) -> Array:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return []
	var data: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(data) == TYPE_DICTIONARY and (data as Dictionary).has("problems"):
		return data["problems"]
	return data if data is Array else []

## The real pool is the only thing that proves the rule is worth having: if it
## recognises none of them, every counting problem is still rendered as text.
func test_matches_the_real_curriculum() -> void:
	var problems: Array = _problems(CURRICULUM)
	assert_true(not problems.is_empty(), "curriculum is readable")
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

## The bottom of the ladder must not look like one question repeated.
##
## Every counting template used to pin one marker to one count range, so the
## first counting problems a child ever meets (counts one to four) were all the
## same drawn disc -- and the shape itself told them how big the answer was. This
## is the regression test for that: the low band has to use most of the alphabet.
func test_the_low_band_uses_many_shapes() -> void:
	var shapes := {}
	for p in _problems(CURRICULUM):
		if String(p.get("domain", "")) != "counting":
			continue
		if int(p.get("curriculumStep", 99)) > 1:
			continue
		var text := String(p.get("prompt", {}).get("text", ""))
		if CountRow.tokens_in(text) <= 0:
			continue
		shapes[CountRow.shape_for(CountRow.marker_in(text))] = true
	assert_true(shapes.size() >= 8,
		"counting steps 0-1 draw at least 8 of the 12 shapes, got %d" % shapes.size())
