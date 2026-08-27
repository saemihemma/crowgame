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

## What used to live here: `tutorial_for_problem`, `depth_for_problem`,
## `_is_behind`, `_learner_has_reached`, `BELOW_OFF`, and the
## `math/tutorial_below_level` flag they read.
##
## They were the machinery of teaching IN FRONT OF a question -- decide whether
## this particular problem's concept was unseen, whether the learner had reached
## it, whether they had climbed past it, and how much lesson a past-it concept
## deserved. Three guards, a three-valued feature flag and a row on the parent
## screen, all of them answering "is it safe to interrupt with this one".
##
## The lane is gone, so the guards guard nothing. A lesson now arrives after an
## answer, for the rung the child is standing on, which needs none of it: you
## cannot be below or above where you are.
##
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


# --- WHEN a lesson arrives ---------------------------------------------------
#
# Everything above this line decides whether an idea is new and how much of a
# lesson it earns. What was missing was WHEN, and that is the part a child feels.
#
# The old answer was "in front of the next question whose concept you have not
# seen". Every one of those lessons was justified on its own -- which is exactly
# why the shape went unnoticed -- but the child's experience was an ambush: they
# walked up to an owl to answer something and got a board of cards first, on an
# idea they had not asked about, at a moment they had not chosen. Two owls into a
# level and the platformer had become a slideshow.
#
# The new answer is one lesson per CATEGORY: the one for the rung the child is
# standing on, delivered after an answer rather than before one, and re-openable
# from the board's "?" forever.
#
# DERIVED, NOT REMEMBERED. The first version of this held the debt in a
# dictionary filled by curriculum_step_up. It was wrong twice over: the
# dictionary died with the session, so a child who quit before the next owl was
# never taught that rung at all; and a debt could sit behind an unrelated
# first-contact lesson for owls on end with nothing to re-raise it. Asking the
# ladder directly has neither problem -- "the lesson for where you stand, if you
# have not seen it" is true again the moment it is asked, after a quit, a
# reinstall, or ten owls later.
#
# So there is no step-up listener and no pending state. Levelling up IS what
# moves a child onto a rung whose lesson they have not seen, which is what makes
# this the same rule the child described: when I level up, I get taught.

## The lesson this category owes the child: the one for the rung they stand on,
## or {} if they have already been shown it.
func pending_lesson(domain: String) -> Dictionary:
	var lesson := current_lesson_for(domain)
	if lesson.is_empty() or has_seen(String(lesson.get("id", ""))):
		return {}
	return lesson

## Any category's outstanding lesson, preferring the one just answered.
##
## A child can level up in counting and then not meet a counting question for a
## whole level; preferring the current domain keeps the common case in order,
## and falling through to the others stops a debt going stale.
func pending_lesson_any(preferred_domain: String) -> Dictionary:
	var lesson := pending_lesson(preferred_domain)
	if not lesson.is_empty():
		return lesson
	for domain in MathDomains.ALL:
		lesson = pending_lesson(String(domain))
		if not lesson.is_empty():
			return lesson
	return {}

## The lesson for where this child stands in a category, seen or not.
##
## This is the help button, and it deliberately ignores `tutorialsSeen`: the
## whole point is to re-open a lesson the child has already been given. Returns
## {} when the rung has no authored lesson, so the button can hide itself rather
## than open on nothing.
func current_lesson_for(domain: String) -> Dictionary:
	# Checked against the roster rather than trusted: get_current_step() indexes
	# the snapshot directly and throws on a domain that is not in it, and the
	# caller here is a UI button reading a `domain` field off problem data.
	if domain == "" or not MathDomains.ALL.has(domain):
		return {}
	var concept := ConceptLadder.concept_for(domain, LearnerStateManager.get_current_step(domain))
	if concept.is_empty():
		return {}
	return get_tutorial(ConceptLadder.tutorial_id(concept))

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
