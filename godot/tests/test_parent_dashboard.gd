extends TestCase
## The grown-up dashboard: the arithmetic behind it, and that every tab builds.
##
## This screen is built entirely in code from Config.ui(), TextManager.t() and
## ThemeManager.get_color_value(), so a missing tuning path or string key does
## not fail at build time -- it fails the first time a parent opens the panel.
## test_grownup_surfaces.gd covers the keys; this covers the SHAPE: that the
## rows come out in the order the screen's whole argument depends on, that the
## headline number is not a lie, and that the per-question log survives the trip
## through the save.

const PARENT_REPORT := preload("res://scenes/ParentReport.tscn")

func _mount() -> Node:
	var report := PARENT_REPORT.instantiate()
	Engine.get_main_loop().root.add_child(report)
	return report


## THE ORDER IS THE ARGUMENT.
##
## A parent opens this screen to find out where to help, so the subject that
## needs help has to be the first row. The old report sorted by how much had
## been answered, which led with whatever the child had been doing most of --
## usually the thing they were already good at.
func test_the_subject_needing_help_is_the_first_row() -> void:
	var report := _mount()
	var cloud := {
		"domains": [
			{"domain": "addition", "attempted": 40, "correct": 38, "firstTryAccuracy": 0.94},
			{"domain": "subtraction", "attempted": 31, "correct": 19, "firstTryAccuracy": 0.55},
			{"domain": "counting", "attempted": 22, "correct": 18, "firstTryAccuracy": 0.78},
		],
	}
	var rows: Array = report._subjects(cloud, {})
	var order: Array = []
	for row in rows:
		order.append(String((row as Dictionary)["domain"]))
	assert_eq(order, ["subtraction", "counting", "addition"],
		"weakest subject first, strongest last")
	report.queue_free()


## A subject with too few answers to mean anything sorts to the END whatever its
## percentage. Two questions wrong is not a weakness, and putting it at the top
## of a "where to help" list sends a parent to the wrong place.
func test_a_subject_with_no_verdict_sorts_last() -> void:
	var report := _mount()
	var cloud := {
		"domains": [
			{"domain": "division", "attempted": 2, "correct": 0, "firstTryAccuracy": null},
			{"domain": "subtraction", "attempted": 31, "correct": 19, "firstTryAccuracy": 0.55},
		],
	}
	var rows: Array = report._subjects(cloud, {})
	assert_eq(String((rows[0] as Dictionary)["domain"]), "subtraction",
		"a subject with a real verdict outranks one with none")
	assert_eq(String((rows[1] as Dictionary)["domain"]), "division",
		"the thin sample goes last")
	assert_true(float((rows[1] as Dictionary)["accuracy"]) < 0.0,
		"and is marked as having no verdict rather than as 0%")
	report.queue_free()


## The headline is weighted by how much of each subject there is.
##
## An unweighted mean of the percentages would let one three-question subject
## swing the number a parent reads first: 100% of 3 and 50% of 97 is 51% of the
## child's practice, not 75%.
func test_the_headline_rate_is_weighted_by_how_much_was_answered() -> void:
	var report := _mount()
	var cloud := {
		"domains": [
			{"domain": "division", "attempted": 3, "correct": 3, "firstTryAccuracy": 1.0},
			{"domain": "addition", "attempted": 97, "correct": 49, "firstTryAccuracy": 0.5},
		],
	}
	var rate: float = report._first_try_rate(cloud, {})
	assert_true(absf(rate - 0.515) < 0.01,
		"weighted rate is ~51%%, not the 75%% an unweighted mean would give (got %.3f)" % rate)
	report.queue_free()


## With no server, the same rows are built from the child's own per-question log.
## A family playing offline gets a real report, not an empty one.
func test_the_overview_works_from_the_local_log_alone() -> void:
	var report := _mount()
	var save := {"telemetry": {"attemptLog": [
		{"domain": "addition", "correct": true, "firstTry": true, "at": 1, "ms": 2000},
		{"domain": "addition", "correct": true, "firstTry": true, "at": 2, "ms": 2000},
		{"domain": "subtraction", "correct": false, "firstTry": true, "at": 3, "ms": 9000},
		{"domain": "subtraction", "correct": true, "firstTry": false, "at": 4, "ms": 9000},
	]}}
	var rows: Array = report._subjects({}, save)
	assert_eq(rows.size(), 2, "one row per subject the child has actually met")
	assert_eq(String((rows[0] as Dictionary)["domain"]), "subtraction",
		"the weaker subject is still first with no server involved")
	assert_eq(int((rows[0] as Dictionary)["attempted"]), 2, "counted from the log")
	report.queue_free()


## Newest first. The question a parent has is about this afternoon, and a log
## that opens on the child's first ever answer is one they have to scroll to the
## bottom of every time.
func test_the_log_reads_newest_first() -> void:
	var report := _mount()
	var turned: Array = report.newest_first([{"at": 1}, {"at": 2}, {"at": 3}])
	var order: Array = []
	for entry in turned:
		order.append(int((entry as Dictionary)["at"]))
	assert_eq(order, [3, 2, 1], "the most recent answer is the first row")
	assert_eq(report.newest_first([]), [], "and an empty log turns round to nothing")
	report.queue_free()


## The whole screen, every tab, with a child who has played.
##
## The tabs are built from lambdas holding enum values and the overview awaits a
## cloud fetch, so this is the test that catches a tab that raises rather than
## renders -- which is the failure mode a parent meets as a blank panel.
func test_every_tab_builds() -> void:
	var report := _mount()
	# Long enough to exercise the log's row builder, the phrasing lookup and the
	# "when" arithmetic on entries of different ages.
	var now := int(Time.get_unix_time_from_system()) * 1000
	var day := 86400 * 1000
	var log: Array = []
	for i in 6:
		log.append({
			"id": "cur_add_001", "domain": "addition", "correct": i % 2 == 0,
			"firstTry": i % 3 == 0, "hints": i % 2, "ms": 1000 * (i + 1),
			"at": now - i * day, "step": i,
		})
	report._profiles = [{"username": "probe"}]
	report._child = 0
	report._cloud["probe"] = {}
	for tab in [report.Tab.OVERVIEW, report.Tab.LOG, report.Tab.SETTINGS]:
		await report._show_tab(tab)
		assert_true(report._column.get_child_count() > 0,
			"tab %d rendered something" % tab)
		assert_true(report._tab_row.get_child_count() == 3,
			"the tab strip always offers all three")
	report.queue_free()


## The verdict colour is the same one everywhere on the screen, which is the
## whole point of it being a shared function: a green bar and a green tick have
## to agree, or a parent learns two colour languages on one screen.
func test_the_verdict_bands_are_shared() -> void:
	var good := StatBar.colour_for(1.0)
	var low := StatBar.colour_for(0.0)
	assert_true(good != low, "right and wrong are not the same colour")
	assert_eq(StatBar.colour_for(0.86), good, "just above the good threshold is good")
	assert_true(StatBar.colour_for(0.75) != good and StatBar.colour_for(0.75) != low,
		"the middle band is its own colour")


## The question a parent reads is the question the child was shown, in the
## family's language -- the same overlay the maths board renders through.
func test_a_logged_problem_comes_back_as_its_question() -> void:
	var problem: Variant = MathProblemManager.find_problem("cur_add_001")
	assert_true(problem is Dictionary, "a known problem id resolves to a problem")
	if problem is Dictionary:
		var text := MathPhrasing.localise(problem as Dictionary, "prompt")
		assert_true(text.length() > 0 and text != "cur_add_001",
			"and to a sentence rather than to its own id (got '%s')" % text)


## A problem that has since left the pools still produces a usable row. The log
## outlives the content it points at, and a raw id in front of a parent is worse
## than no row at all.
func test_a_retired_problem_falls_back_to_its_subject() -> void:
	var report := _mount()
	var text: String = report._question_text({"id": "no_such_problem", "domain": "subtraction"})
	assert_eq(text, TextManager.t("domain_subtraction"),
		"an unknown id falls back to the subject it was asked in")
	report.queue_free()


## THE ROW HEIGHT THE SCREEN DOES NOT GET TO CHOOSE.
##
## Every BrandButton is raised to Gate B3's 88px floor when it enters the tree,
## whatever custom_minimum_size it was handed. This screen asked ui_tuning for 64
## and laid its top bar and tab strip out on that number, so both were 24px
## taller than the space reserved for them and drew through the row beneath --
## the tabs sat on top of the headline tiles. Anchoring the layout to the floor
## itself is what stops that coming back the next time the tuning file is edited.
func test_the_top_bar_and_tabs_do_not_overlap_what_is_under_them() -> void:
	var report := _mount()
	report._profiles = [{"username": "probe"}]
	report._child = 0
	report._cloud["probe"] = {}
	await report._show_tab(report.Tab.OVERVIEW)

	assert_eq(report.ROW_HEIGHT, BrandButton.MIN_HEIGHT,
		"the layout is computed from the height a BrandButton actually takes")
	var tabs_top: float = report._tab_row.offset_top
	var tabs_bottom: float = report._tab_row.offset_bottom
	assert_true(tabs_bottom - tabs_top >= BrandButton.MIN_HEIGHT,
		"the tab strip reserves at least the height its buttons will take (got %.0f)"
			% (tabs_bottom - tabs_top))
	assert_true(tabs_top >= report.BAR_TOP + BrandButton.MIN_HEIGHT,
		"and starts below the top bar rather than through it")
	assert_true(report._scroll.offset_top >= tabs_bottom,
		"and the body starts below the tab strip (%.0f vs %.0f)"
			% [report._scroll.offset_top, tabs_bottom])
	report.queue_free()


## What a parent reads about a product decision is a sentence, not the note the
## next engineer reads. The whole note used to be printed, and one of them is a
## paragraph about selector weighting and journey-sim throughput.
func test_a_flag_explains_itself_in_one_sentence() -> void:
	var report := _mount()
	var long_note := "Stop offering a finished subject. OwlSelection picks by staleness x weight and has no notion of mastery, so a domain at its ceiling is still eligible."
	assert_eq(report._first_sentence(long_note), "Stop offering a finished subject.",
		"only the first sentence reaches the screen")
	assert_eq(report._first_sentence("No full stop here"), "No full stop here",
		"a note that is already one sentence is left alone")
	assert_eq(report._flag_name("retire_exhausted_domains"), "Retire exhausted domains",
		"and the flag's name is not shouted in snake_case at a parent")
	report.queue_free()


## A COUNTING QUESTION IS HALF PICTURE, and the half a log can print is not the
## half that carries the question.
##
## Its prompt holds a run of marker characters that the board swaps for drawn
## tokens. Printed raw, the log reached a parent as "How many rings? @ @ @ @ @";
## printed as the caption alone, every counting question in the log would be the
## same sentence. So the caption keeps the count.
func test_a_counting_question_reads_as_words_and_a_number() -> void:
	var report := _mount()
	# The board's own parse, on the board's own kind of prompt.
	var prompt := "How many rings? @ @ @ @ @"
	assert_eq(CountRow.tokens_in(prompt), 5, "the prompt really does hold a marker run")
	var counting := {"id": "not_in_the_pools", "domain": "counting"}
	# Through the real path, with a problem the pools do carry.
	var shown: String = TextManager.t("report_log_count_of",
		[CountRow.caption_in(prompt), str(CountRow.tokens_in(prompt))])
	assert_true(not shown.contains("@"), "no marker characters reach a parent (got '%s')" % shown)
	assert_true(shown.contains("5"), "and the count is still in it")
	assert_eq(report._question_text(counting), TextManager.t("domain_counting"),
		"an unknown id still falls back to its subject")
	report.queue_free()


## "The last 1 questions" and "1 hints" both shipped on this screen. The bundles
## carry `.one` forms and TextManager.tp picks them; t() does not.
func test_the_log_counts_things_in_grammar() -> void:
	for locale in ["en", "is"]:
		TextManager.set_locale(locale)
		var one := TextManager.tp("report_log_intro", {"n": 1}, "n")
		var many := TextManager.tp("report_log_intro", {"n": 7}, "n")
		assert_true(one != many, "[%s] one question does not read like seven" % locale)
		assert_true(not one.contains("1 "), "[%s] and does not say '1 questions': '%s'" % [locale, one])
		var one_hint := TextManager.tp("report_log_with_help", {"n": 1, "s": 4}, "n")
		var two_hints := TextManager.tp("report_log_with_help", {"n": 2, "s": 4}, "n")
		assert_true(one_hint != two_hints, "[%s] one hint does not read like two" % locale)
	TextManager.set_locale("en")
