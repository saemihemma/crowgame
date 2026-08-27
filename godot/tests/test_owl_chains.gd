extends TestCase
## The owl roster is the difficulty dial the game is tuned with: one owl, one
## answer by default, with longer chains available per-NPC. These are the two
## facts that dial depends on, and neither was covered before — the owl probe
## printed "2 problems solved" from a hardcoded string while the registry said
## one, and nothing noticed.


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

## The point of the roster is that the dial has range. If every owl converged on
## the same chain length the variants would be dead weight.
func test_roster_offers_longer_chains() -> void:
	var lengths := {}
	for npc in _npcs():
		var c := _problem_count(npc)
		if c > 0:
			lengths[c] = true
	assert_true(lengths.has(1), "at least one single-answer owl")
	assert_true(lengths.size() >= 2, "the roster spans more than one chain length")
