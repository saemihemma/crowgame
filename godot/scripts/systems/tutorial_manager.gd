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
	if _is_behind(concept) and String(Config.flag("math/tutorial_below_level", DEPTH_BRIEF)) == BELOW_OFF:
		return {}
	return get_tutorial(tutorial_id)

## Teaching depth for a lesson that is about to open on a specific problem.
##
## Callers with a problem in hand should prefer this over depth_for(): the gate
## above lets a below-level lesson through, and this is what stops it arriving as
## the full four-card treatment.
func depth_for_problem(problem: Dictionary, tutorial_id: String) -> String:
	var concept := ConceptLadder.concept_for_problem(problem)
	if not concept.is_empty() and _is_behind(concept):
		if String(Config.flag("math/tutorial_below_level", DEPTH_BRIEF)) == DEPTH_BRIEF:
			return DEPTH_BRIEF
	return depth_for(tutorial_id)

## `math/tutorial_below_level` value meaning "do not teach it at all". The other
## two values are DEPTH_FULL and DEPTH_BRIEF, which is why they are not restated:
## the flag says what a below-level lesson LOOKS like, and "nothing" is the third
## option rather than a separate axis.
const BELOW_OFF := "off"

## Is this concept entirely behind where the learner now stands?
##
## The gate in tutorial_for_problem is one-sided, and that asymmetry was the bug.
## It refuses to teach a concept ABOVE the learner, for a good reason spelled out
## above -- the stretch lane deals a reach and a lesson for it would be a lesson
## nobody earned. Nothing guarded the other direction, and the other direction is
## where 60% of the questions come from: comfort is 40% and review another 20%,
## both drawing at or below the current rung.
##
## Combined with placement that seeds a child forward from their birth year and
## then moves them a WHOLE CONCEPT per answer for three answers, a child can be
## carried past rungs 3 to 5 without one problem ever being served from them.
## Every rung skipped that way is a landmine: the first time the comfort lane
## deals a problem from it, its concept is unseen, `_learner_has_reached` is
## trivially satisfied, and a four-card lesson opens mid-run for an idea the child
## left behind long ago. That is the playtest note about "að telja áfram" -- the
## counting-on lesson -- arriving unmotivated and out of order.
##
## Behind means the concept's LAST rung is below the learner's current step, not
## its first. A concept the learner is standing inside is the one they are working
## on, and teaching that is the whole point of the system.
func _is_behind(concept: Dictionary) -> bool:
	var domain := String(concept.get("domain", ""))
	var steps: Variant = concept.get("steps", null)
	if domain == "" or not (steps is Array) or (steps as Array).size() < 2:
		return false
	return LearnerStateManager.get_current_step(domain) > int((steps as Array)[1])

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


# --- how often, as opposed to how deep ---------------------------------------
#
# Everything above this line decides WHETHER an idea is new and HOW MUCH of a
# lesson it earns. Nothing decided how OFTEN, and that turned out to be the part
# a child feels.
#
# Each lesson is once-ever and individually justified, which is exactly why the
# frequency went unnoticed: no single one of them is wrong. But they are not
# spread evenly. A child climbing the ladder meets new rungs in bursts, `seen` is
# per concept rather than per sitting, and the only limit was one lesson per OWL
# -- so a level with three owls could hand out three lessons, each of them a
# board of cards to tap through, in one run of a platformer. That is the
# "step-by-step teaching for each level" complaint: not any lesson, the rate.
#
# So the budget is per LEVEL. What does not fit waits for the next one; nothing
# is lost, because an unseen concept stays unseen and is taught the next time its
# rung comes up.

## Lessons already spent in this level.
##
## Runtime only, deliberately NOT in the save: the budget is about the pacing of
## one sitting, and a child who quits and comes back should get taught, not find
## a spent counter waiting for them.
var _lessons_this_level := 0

## A new level, a fresh budget. Called from Game._load_level, which is the one
## place a level begins -- first entry, the door, and a death reload all reach it.
func begin_level() -> void:
	_lessons_this_level = 0

## Is there room to teach in this level?
##
## A cap below zero means no cap, which is what the pre-budget game did and the
## only way back to it without a code change.
func can_teach_now() -> bool:
	var cap := int(Config.tutorial("lessons_per_level", 1))
	return cap < 0 or _lessons_this_level < cap

## Record that this level spent a lesson.
##
## Called for FIRST CONTACT too, even though first contact never asks
## can_teach_now(). PRODUCT.md commits that meeting a brand-new domain always
## opens with a worked example, so that lesson is exempt from the check -- but it
## is still a board of cards the child just tapped through, and letting it not
## count would put a rung reminder straight after it in the same level, which is
## the exact double-lesson the budget exists to stop.
func spend_lesson() -> void:
	_lessons_this_level += 1

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
