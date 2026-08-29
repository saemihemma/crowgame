extends TestCase
## The owl roster is the difficulty dial the game is tuned with, and difficulty
## is now the ONLY thing it dials: every owl asks exactly one question. Length
## used to be per-NPC as well, which read as range on paper and as a stall in the
## hands of a child — see test_every_owl_asks_exactly_one_question below.
##
## These facts were uncovered before — the owl probe printed "2 problems solved"
## from a hardcoded string while the registry said one, and nothing noticed.


func _root() -> Node:
	return Engine.get_main_loop().root

func _npcs() -> Array:
	var dm: Node = _root().get_node("DataManager")
	return dm.get_dict("NPC_REGISTRY").get("npcs", [])

func _problem_count(npc: Dictionary) -> int:
	for c in npc.get("components", []):
		if String(c.get("type", "")) == "math_challenge":
			return int(c.get("problemCount", 1))
	return -1

## The registry states the same number twice — behaviorConfig.chainLinks for art
## and the HUD, problemCount for the challenge — and the schema says they must
## agree. A documented invariant with no test is a comment, so: enforce it.
func test_chain_links_match_problem_count() -> void:
	var checked := 0
	for npc in _npcs():
		if not npc.get("behaviorConfig", {}).has("chainLinks"):
			continue
		var links := int(npc["behaviorConfig"]["chainLinks"])
		var count := _problem_count(npc)
		assert_eq(count, links,
			"'%s': chainLinks (%d) must equal problemCount (%d)" % [String(npc.get("id", "?")), links, count])
		checked += 1
	assert_true(checked >= 4, "several chained owls exist to check")

## One correct answer breaks a default owl's chain. Quick maths, then back to
## running — a two-question default turns every owl into an interruption.
func test_default_owl_needs_one_answer() -> void:
	var found := false
	for npc in _npcs():
		if String(npc.get("id", "")) != "owl_teacher_01":
			continue
		found = true
		assert_eq(_problem_count(npc), 1, "the default owl asks exactly one question")
	assert_true(found, "owl_teacher_01 is in the roster")

## ONE OWL, ONE QUESTION. Every owl, with no exception available.
##
## This replaces a test that asserted the opposite -- that the roster spanned
## more than one chain length, because the length was meant to be a per-owl dial
## for a later gated owl. Played, it was not a dial, it was a stall: every level
## carried an owl_gauntlet and level_05 carried two plus a triple, so a child
## running a platformer was stopped for three questions in a row, repeatedly, in
## a game whose whole loop is "meet an owl, answer one thing, keep running".
##
## The roster still has range -- gentle, mid and hardest bands, which is
## difficulty, the dial that was actually wanted. Length is not a dial any more,
## and this test is what stops it becoming one again by accident.
func test_every_owl_asks_exactly_one_question() -> void:
	var checked := 0
	for npc in _npcs():
		if String(npc.get("behavior", "")) != "math_challenger":
			continue
		var id := String(npc.get("id", "?"))
		assert_eq(_problem_count(npc), 1, "'%s' asks exactly one question" % id)
		assert_eq(int(npc.get("behaviorConfig", {}).get("chainLinks", -1)), 1,
			"'%s' draws exactly one chain link" % id)
		checked += 1
	assert_true(checked >= 4, "the whole roster was checked (%d owls)" % checked)

## The dial that survived: difficulty. If every owl also converged on one band,
## the variants really would be dead weight and the roster should collapse to one
## entry -- so this is the test that keeps the remaining distinction honest.
func test_the_roster_still_spans_difficulty_bands() -> void:
	var bands := {}
	for npc in _npcs():
		for c in npc.get("components", []):
			if String(c.get("type", "")) != "math_challenge":
				continue
			bands[str(c.get("difficultyRange", []))] = true
	assert_true(bands.size() >= 3,
		"gentle, mid and hard are still three different owls (got %d bands)" % bands.size())
