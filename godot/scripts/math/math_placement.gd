extends RefCounted
class_name MathPlacement
## Where a child STARTS, and how fast the game corrects itself if it guessed wrong.
##
## Every child used to open the game on the same rung: addition step 2, counting
## step 2, everything else step 0. A seven-year-old halfway through 1. bekkur and
## a four-year-old who has never seen a numeral got the identical first question,
## and the only way out was the ordinary ladder -- three first-try wins at 80%
## accuracy per step, with 60% of questions drawn from at or below the current
## rung. Measured against the concept ladder that is roughly thirty questions to
## cross one concept, and the child who is bored is the child who is bored for
## thirty questions.
##
## Two mechanisms, in the order they fire:
##
##   1. THE AGE SEED, once, on a profile's first play. Birth year is already
##      collected at login and already maps to an Icelandic bekkur under
##      grunnskólalög (docs/GRADE_EXPECTATIONS.md); this uses the same mapping
##      the parent report does, so the game's opinion of where a child stands
##      and the report's opinion cannot drift.
##
##   2. THE CALIBRATION WINDOW, over the first few answers. The seed is a guess
##      from a birth year, which knows nothing about this particular child. For
##      the length of the window a first-try win moves a whole concept rung
##      rather than one step, and a miss moves back the same way -- so a wrong
##      guess is corrected in about three questions instead of thirty, in either
##      direction, without ever showing a child a test.
##
## NOTHING HERE IS A CLAIM OF MASTERY. The seed sets currentStep and leaves
## winsAtCurrentStep, totalAttempts, every accuracy figure AND `highestStep`
## exactly where they were, because the child has not answered anything yet.
## highestStep in particular is not bookkeeping: main_menu.gd awards the trophy
## shelf off it, so raising it with the seed would hand a 2. bekkur child the top
## trophy in every domain for their first correct answer. It is also a floor on
## nothing -- demotion floors at 0 -- so there is nothing to keep coherent by
## moving it.
##
## Deliberately not inside learner_state_manager.gd: that file is parity-locked
## against math-kernel/** golden fixtures, and where a child starts is a product
## decision about Icelandic six-year-olds that will be retuned from play data.
## It reaches the learner model through replace_snapshot(), which is public.

## The window, in lifetime attempts. Three is what a grown-up asked for and it is
## also about right: each answer inside it can move a whole concept, so three
## covers most of the distance between a leikskóli child and a 2. bekkur one.
const CALIBRATION_ATTEMPTS := 3

## How far back from the expected rung the seed lands.
##
## grade_expectations.json says what a child should have finished by the END of a
## grade. Seeding a child at the end of the grade they just left would open the
## game on the hardest thing they are supposed to know, which is the one way to
## make a confident child quit in the first minute. Two rungs back opens on
## something they should find easy -- and the calibration window climbs out of it
## in one answer if that was too cautious.
const SEED_BACKOFF_STEPS := 2

## The audience ceiling, in grades. A child born early enough to be in 3. bekkur
## or beyond gets the same seed as a 2. bekkur child, because everything past
## that is unreachable anyway: math_challenge_component's maxOperand is 20, which
## is the Icelandic first-year number range and the declared edge of who this
## game is for. Seeding into content the selector cannot draw would strand a
## child on an empty rung.
const MAX_SEEDED_GRADE := 2


## Icelandic school grade from a birth year. 0 or below means leikskóli.
##
## Identical rule to server/src/lib/grade.ts and to the parent report:
## compulsory school starts in the calendar year the child turns six (Lög um
## grunnskóla nr. 91/2008, 15. gr.), so grade is a function of birth year alone.
## The school-year boundary month is data, not a literal.
static func grade_for(birth_year: int, now: Dictionary) -> int:
	if birth_year <= 0:
		return 0
	var meta: Dictionary = _grade_data().get("meta", {})
	var boundary := int(meta.get("schoolYearBoundaryMonth", 8))
	var year := int(now.get("year", 0))
	var month := int(now.get("month", 1))
	var school_year_start := year if month >= boundary else year - 1
	return school_year_start - birth_year - 5


## The starting step per domain for a child in `grade`, or {} for no seed at all.
##
## leikskóli seeds nothing: Aðalnámskrá leikskóla defines no mathematics
## criteria, so there is no floor to stand a pre-school child on and the ordinary
## step-0 opening is the honest one.
static func seed_steps(grade: int) -> Dictionary:
	if grade <= 0:
		return {}
	var capped: int = mini(grade, MAX_SEEDED_GRADE)
	var out := {}
	var domains: Dictionary = _grade_data().get("domains", {})
	for domain in domains:
		var step := _expected_step(domains[domain], capped - 1)
		if step <= 0:
			continue
		var seeded: int = maxi(0, step - SEED_BACKOFF_STEPS)
		if seeded > 0:
			out[String(domain)] = seeded
	return out


## What a child should have finished by the end of `end_of_grade`, on one
## domain's milestone list. 0 when that grade has no milestone -- a domain the
## grade tables do not reach yet is left at its ordinary start rather than
## guessed at from the next grade up.
static func _expected_step(milestones: Variant, end_of_grade: int) -> int:
	if end_of_grade <= 0 or not (milestones is Array):
		return 0
	for m in (milestones as Array):
		if m is Dictionary and int((m as Dictionary).get("endOfGrade", -1)) == end_of_grade:
			return int((m as Dictionary).get("step", 0))
	return 0


## Apply the seed to a learner snapshot, returning the modified copy.
##
## Only ever raises. A returning child whose ladder has already moved past the
## seed keeps their own position: the seed is an opening guess, and a measured
## position always outranks a guess from a birth year.
static func seed_snapshot(snapshot: Dictionary, steps: Dictionary) -> Dictionary:
	var out := snapshot.duplicate(true)
	var progress: Variant = out.get("curriculumProgress", null)
	if not (progress is Dictionary):
		return out
	for domain in steps:
		var entry: Variant = (progress as Dictionary).get(domain, null)
		if not (entry is Dictionary):
			continue
		var seeded := int(steps[domain])
		var d := entry as Dictionary
		if int(d.get("totalAttempts", 0)) > 0 or int(d.get("currentStep", 0)) >= seeded:
			continue
		# currentStep ONLY. See the note at the top of this file: highestStep is
		# what the trophy shelf reads, and a birth year does not earn a trophy.
		d["currentStep"] = seeded
	return out


## Is this child still being placed?
static func is_calibrating(lifetime_attempts: int) -> bool:
	return lifetime_attempts < CALIBRATION_ATTEMPTS


## Where the calibration window moves a child after one answer.
##
## A first-try win jumps to the first rung of the NEXT concept; anything else
## drops to the first rung of the PREVIOUS one. Concept boundaries rather than
## +/-1 step because a concept is the unit a child either has or has not met --
## moving one step inside "count on" tells you nothing you did not already know,
## and the window is only three answers long.
##
## A retry win holds position. It is evidence the rung is about right, which is
## exactly where placement wants to stop.
static func calibrated_step(domain: String, current_step: int, correct: bool, first_attempt: bool) -> int:
	if correct and first_attempt:
		return ConceptLadder.next_concept_step(domain, current_step)
	if not correct:
		return ConceptLadder.previous_concept_step(domain, current_step)
	return current_step


## Move one domain to `step` inside a snapshot, returning the modified copy.
##
## winsAtCurrentStep resets: those wins were banked toward promoting off a rung
## the child is no longer on, and carrying them across would promote them off the
## new one for work they did somewhere else. totalAttempts and the accuracy
## history are left alone -- placement moves WHERE a child is, never the record
## of what they have answered.
##
## highestStep DOES move here, unlike in the age seed. A calibration move is paid
## for with an answer, so the trophy it can unlock is earned; the seed is a guess
## from a birth year, and is not. This mirrors the ladder's own stretch-lane fast
## path, which raises highestStep on exactly the same evidence.
static func place_snapshot(snapshot: Dictionary, domain: String, step: int) -> Dictionary:
	var out := snapshot.duplicate(true)
	var progress: Variant = out.get("curriculumProgress", null)
	if not (progress is Dictionary):
		return out
	var entry: Variant = (progress as Dictionary).get(domain, null)
	if not (entry is Dictionary):
		return out
	var d := entry as Dictionary
	var placed: int = maxi(0, step)
	if placed == int(d.get("currentStep", 0)):
		return out
	d["currentStep"] = placed
	d["highestStep"] = maxi(int(d.get("highestStep", 0)), placed)
	d["winsAtCurrentStep"] = 0
	return out


## Seed this profile's opening rungs from its birth year, and report what it did.
##
## Safe to call on every login: seed_snapshot only raises a domain the child has
## answered nothing in, so a returning player keeps the position they earned and
## a player with no birth year on file is left exactly where the defaults put
## them. Returns the applied domain -> step map, empty when nothing was seeded.
static func apply_seed(profile: Variant) -> Dictionary:
	if not (profile is Dictionary):
		return {}
	var birth_year := int((profile as Dictionary).get("birthYear", 0))
	if birth_year <= 0:
		return {}
	var steps := seed_steps(grade_for(birth_year, Time.get_datetime_dict_from_system()))
	if steps.is_empty():
		return {}
	var seeded := seed_snapshot(LearnerStateManager.get_snapshot(), steps)
	LearnerStateManager.replace_snapshot(seeded)
	return steps


static func _grade_data() -> Dictionary:
	return DataManager.get_dict("GRADE_EXPECTATIONS")
