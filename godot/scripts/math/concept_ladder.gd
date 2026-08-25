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
static func concept_for(domain: String, step: int) -> Dictionary:
	for entry in _concepts():
		if String(entry.get("domain", "")) != domain:
			continue
		var steps: Array = entry.get("steps", [])
		if steps.size() == 2 and step >= int(steps[0]) and step <= int(steps[1]):
			return entry
	return {}

## The concept a selected problem belongs to. Reads the problem's own
## `curriculumStep` rather than the learner's current step: the child is about
## to be shown THIS problem, and a comfort-lane pick sits a rung below where
## they are.
static func concept_for_problem(problem: Dictionary) -> Dictionary:
	if problem.is_empty():
		return {}
	return concept_for(String(problem.get("domain", "")), int(problem.get("curriculumStep", 0)))

## Every concept in one domain, in ladder order.
static func concepts_in(domain: String) -> Array:
	var out: Array = []
	for entry in _concepts():
		if String(entry.get("domain", "")) == domain:
			out.append(entry)
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
static func tutorial_id(concept: Dictionary) -> String:
	return String(concept.get("tutorial", ""))

static func all() -> Array:
	return _concepts()

static func _concepts() -> Array:
	var data: Dictionary = DataManager.get_dict("CONCEPT_LADDER")
	var list: Variant = data.get("concepts", [])
	return list if list is Array else []
