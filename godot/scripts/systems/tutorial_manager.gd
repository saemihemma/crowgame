extends Node
## TutorialManager — decides WHEN a child gets taught, and remembers that they were.
##
## The owl already had one teaching moment: the first time a child ever meets a
## domain, it demonstrates a worked example and then hands over a freebie
## (math_challenge_component.gd). That fires once per domain, ever. It cannot
## help the child who has done four hundred additions and is meeting a number
## with a ten in it for the first time, because to the runtime that is still
## just "addition".
##
## This is the same idea at the resolution the maths actually changes at: once
## per CONCEPT (data/curriculum/concept_ladder.json), the rung of the ladder where the
## thing being asked is genuinely new. Thirty concepts, thirty lessons, each
## shown once and never again unless a grown-up asks for it.
##
## Deliberately NOT part of LearnerStateManager. That file is parity-locked
## against golden fixtures and must keep agreeing with math-kernel/** byte for
## byte; teaching state is a product decision that will change often, so it
## lives here and persists through SaveManager instead.

## Emitted when a tutorial finishes, either way. `skipped` is the child's choice,
## not a failure -- SessionStats and the HUD deliberately do not celebrate it.
signal tutorial_finished(payload: Dictionary)

## Teaching depth. FULL is the four-card lesson -- objects, model, worked
## example, guided try. BRIEF is the reminder: the cards named in
## tutorial_tuning.json ("briefCards"), which is the model picture and the
## worked example, no guided question.
##
## The rule is the child's own words for it: a new CATEGORY earns the lesson, a
## new rung inside a category they already know earns a reminder. Forty-seven
## concepts across eight domains meant a child who had done four hundred
## additions still got the full four-card treatment for meeting a ten -- the
## same shape, the same number of taps, the same guided try, for an idea one
## rung from where they already were. Taught every single time is how a lesson
## stops being read.
const DEPTH_FULL := "full"
const DEPTH_BRIEF := "brief"

## The tutorial to play before this problem, or an empty dictionary if the child
## has already met the idea -- which is the overwhelmingly common case, so this
## is the cheap path.
##
## Takes the problem rather than the learner's current step: the child is about
## to be shown THIS problem, and the selection lanes routinely hand out one a
## rung below or above where the ladder says they are.
##
## But NOT above. The stretch lane deals a problem one step past the ladder at a
## tuned rate, and teaching its concept would open a lesson for an idea the
## child has not earned, in the middle of a run, on a question that exists to be
## a reach rather than a lesson. A concept is teachable once its own first rung
## is at or below where the learner stands; the stretch problem is then answered
## on its merits, and the lesson arrives when the ladder does.
func tutorial_for_problem(problem: Dictionary) -> Dictionary:
	var concept := ConceptLadder.concept_for_problem(problem)
	if concept.is_empty():
		return {}
	var tutorial_id := ConceptLadder.tutorial_id(concept)
	if tutorial_id == "" or has_seen(tutorial_id):
		return {}
	if not _learner_has_reached(concept):
		return {}
	return get_tutorial(tutorial_id)

## Has the learner's ladder actually arrived at this concept's first rung?
##
## A concept with no readable step range is treated as reached: an authoring gap
## should cost a child a lesson they did not need, never silence a lesson they
## did.
func _learner_has_reached(concept: Dictionary) -> bool:
	var domain := String(concept.get("domain", ""))
	var steps: Variant = concept.get("steps", null)
	if domain == "" or not (steps is Array) or (steps as Array).is_empty():
		return true
	return LearnerStateManager.get_current_step(domain) >= int((steps as Array)[0])

## FULL for the first lesson a child ever gets in a domain, BRIEF after that.
##
## Derived rather than authored: a `teachDepth` field on all forty-seven concept
## entries would be forty-seven chances to disagree with the one rule that
## actually matters, and the rule is about the CHILD's history, not the
## concept's -- the same rung is a first meeting for one child and a fifth for
## another.
func depth_for(tutorial_id: String) -> String:
	var dot := tutorial_id.find(".")
	if dot <= 0:
		return DEPTH_FULL
	var prefix := tutorial_id.substr(0, dot + 1)
	for seen_id in SaveManager.get_tutorials_seen():
		if String(seen_id).begins_with(prefix):
			return DEPTH_BRIEF
	return DEPTH_FULL

func has_seen(tutorial_id: String) -> bool:
	return SaveManager.has_seen_tutorial(tutorial_id)

## Look a tutorial up by id. Returns {} for an id with no authored lesson, so a
## concept can name an idea before the lesson for it exists without bricking the
## owl.
func get_tutorial(tutorial_id: String) -> Dictionary:
	if tutorial_id == "":
		return {}
	for entry in _tutorials():
		if String(entry.get("id", "")) == tutorial_id:
			return entry
	return {}

## Record that this child has been taught, and stop offering it.
func mark_seen(tutorial_id: String, skipped: bool) -> void:
	if tutorial_id == "":
		return
	SaveManager.mark_tutorial_seen(tutorial_id, skipped)
	tutorial_finished.emit({"tutorialId": tutorial_id, "skipped": skipped})

## Offer a seen tutorial again. Nothing in the child-facing game calls this: it
## is the seam a grown-up surface ("show that lesson again") plugs into, and the
## reason mark_seen keeps the skipped flag instead of a bare bool.
func forget(tutorial_id: String) -> void:
	var seen := SaveManager.get_tutorials_seen()
	if seen.has(tutorial_id):
		seen.erase(tutorial_id)
		SaveManager.save()

func _tutorials() -> Array:
	var data: Dictionary = DataManager.get_dict("MATH_TUTORIALS")
	var list: Variant = data.get("tutorials", [])
	return list if list is Array else []
