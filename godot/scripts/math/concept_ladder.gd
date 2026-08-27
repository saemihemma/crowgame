extends RefCounted
class_name ConceptLadder
## The concept ladder: which TEACHABLE IDEA a curriculum step belongs to.
##
## The learner model has always known how HARD a problem is -- `curriculumStep`,
## a number from 0 to 36. It has never known what the number MEANS. Step 6 and
## step 9 are both "addition"; one is making ten and the other is still making
## ten, while step 10 is the first time a child meets a number with a ten in it.
## Nothing in the runtime could tell those apart, so nothing could teach the
## difference.
##
## This is the missing layer, and it is data: `data/curriculum/concept_ladder.json`
## groups every domain's steps into contiguous ranges, each with an id, the
## authored skills it covers, and the tutorial it opens with. Runtime code asks
## it two questions -- what concept is this problem, and has this child met it --
## and `tools/validate_math_concepts.mjs` asks it a third: which rungs of the
## ladder have no problems authored on them.
##
## Pure lookup, no state. Seen-state lives in TutorialManager.

## The concept a (domain, step) pair belongs to, or an empty dictionary when the
## domain has no ladder or the step is off the end of it.
##
## Only ever returns a BASE concept. Overlays are claimed by problem shape, not
## by difficulty, so a step on its own cannot select one -- see
## concept_for_problem.
static func concept_for(domain: String, step: int) -> Dictionary:
	for entry in _concepts():
		if String(entry.get("domain", "")) != domain or entry.has("requires"):
			continue
		var steps: Array = entry.get("steps", [])
		if steps.size() == 2 and step >= int(steps[0]) and step <= int(steps[1]):
			return entry
	return {}


## The overlay this problem belongs to, if any.
##
## An overlay claims problems by what they ARE rather than by how hard they are.
## "5 + ? = 8" derives to the same rung as "5 + 3 = 8" -- correctly, it is the
## same bond -- so on step alone it would be handed the make-ten lesson, which
## teaches the wrong thing about it entirely. Matching on the authored skill is
## what separates the two.
##
## Tried BEFORE the step ranges, because an overlay is the more specific claim.
static func overlay_for_problem(problem: Dictionary) -> Dictionary:
	var domain := String(problem.get("domain", ""))
	var skills: Array = problem.get("skills", [])
	for entry in _concepts():
		if String(entry.get("domain", "")) != domain:
			continue
		var requires: Variant = entry.get("requires", null)
		if not (requires is Dictionary):
			continue
		var needed := String((requires as Dictionary).get("skill", ""))
		if needed != "" and skills.has(needed):
			return entry
	return {}

## The concept a selected problem belongs to. Reads the problem's own
## `curriculumStep` rather than the learner's current step: the child is about
## to be shown THIS problem, and a comfort-lane pick sits a rung below where
## they are.
static func concept_for_problem(problem: Dictionary) -> Dictionary:
	if problem.is_empty():
		return {}
	var overlay := overlay_for_problem(problem)
	if not overlay.is_empty():
		return overlay
	return concept_for(String(problem.get("domain", "")), int(problem.get("curriculumStep", 0)))

## Every BASE concept in one domain, in ladder order. Overlays are excluded:
## they have no place in the rung sequence, which is what callers of this want.
static func concepts_in(domain: String) -> Array:
	var out: Array = []
	for entry in _concepts():
		if String(entry.get("domain", "")) == domain and not entry.has("requires"):
			out.append(entry)
	return out

## The first step of the concept AFTER the one `step` falls in, for placement.
##
## Concept boundaries are the unit the calibration window moves in
## (MathPlacement): inside a window three answers long, +1 step tells you almost
## nothing, while "did they clear this whole idea" is the question being asked.
## Off the end of the ladder returns the last rung, so a child who is genuinely
## past everything the game holds stops at the top rather than walking into empty
## content.
static func next_concept_step(domain: String, step: int) -> int:
	var ordered := _ordered_steps(domain)
	for start in ordered:
		if start > step:
			return start
	return ordered[ordered.size() - 1] if not ordered.is_empty() else step


## The first step of the concept BEFORE the one `step` falls in. Floors at 0.
static func previous_concept_step(domain: String, step: int) -> int:
	var ordered := _ordered_steps(domain)
	var best := 0
	for start in ordered:
		if start < _concept_start(domain, step):
			best = maxi(best, start)
	return best


## The first step of the concept `step` falls in, or `step` itself when it falls
## in none -- an authoring hole should not silently move a child.
static func _concept_start(domain: String, step: int) -> int:
	var concept := concept_for(domain, step)
	if concept.is_empty():
		return step
	var steps: Array = concept.get("steps", [])
	return int(steps[0]) if steps.size() == 2 else step


## Every base concept's first step in one domain, ascending. Sorted rather than
## trusted from file order: the ladder is hand-authored JSON and nothing enforces
## that a new entry is inserted in the right place.
static func _ordered_steps(domain: String) -> Array:
	var out: Array = []
	for entry in concepts_in(domain):
		var steps: Array = entry.get("steps", [])
		if steps.size() == 2:
			out.append(int(steps[0]))
	out.sort()
	return out


## Where this concept sits in its domain's ladder, or -1 if it is not on one.
static func index_of(concept_id: String) -> int:
	var entry := by_id(concept_id)
	if entry.is_empty():
		return -1
	return concepts_in(String(entry.get("domain", ""))).find(entry)

static func by_id(concept_id: String) -> Dictionary:
	for entry in _concepts():
		if String(entry.get("id", "")) == concept_id:
			return entry
	return {}

## The tutorial a concept opens with, or "" when it has none authored yet. A
## concept without a tutorial is legal: the ladder can name an idea before
## anyone has written the lesson for it.
##
## `null` is how the ladder file spells "no lesson" for the two multi-digit
## concepts, and String(null) is not a conversion in GDScript -- it raises
## "Nonexistent 'String' constructor" and returns nothing. The error was
## non-fatal, so this read as working while printing two engine errors on every
## pass over the ladder.
static func tutorial_id(concept: Dictionary) -> String:
	var named: Variant = concept.get("tutorial", "")
	return String(named) if named is String else ""

static func all() -> Array:
	return _concepts()

static func _concepts() -> Array:
	var data: Dictionary = DataManager.get_dict("CONCEPT_LADDER")
	var list: Variant = data.get("concepts", [])
	return list if list is Array else []
