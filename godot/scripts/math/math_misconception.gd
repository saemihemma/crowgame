extends RefCounted
class_name MathMisconception
## What the child's WRONG answer says about what they were thinking.
##
## Every authored problem carries `misconceptionTags` -- off_by_one,
## counting_back_error, place_value_slip and eighteen others -- and until now
## nothing in the runtime ever read them. A miss was a miss: the child got the
## problem's one authored hint, which is written for whoever is stuck on it, not
## for this particular child's mistake.
##
## The tags are on the PROBLEM, not on each distractor, so the confusion cannot
## simply be looked up. It has to be recognised from the relationship between the
## number that was tapped and the number that was right, and it is only claimed
## when both halves agree: the arithmetic of the miss says which confusion it
## was, AND the author declared that this problem could produce it.
##
## Deliberately conservative. A hint that says "so close, count once more" to a
## child who was out by seven is worse than the generic one, because it tells
## them their thinking was nearly right when it was not. Anything this cannot
## name falls back to the authored hint, which is where every problem started.
##
## Not to be confused with the review queue, which still targets the SKILL. That
## is the other half of the same roadmap entry and it lives in the learner model,
## which is parity-locked against math-kernel/**; this half is what the child
## reads in the moment.

## Recognisable misses, in the order they are tried. Each names the tag it can
## identify and how far the tapped answer sits from the right one.
##
## Priority matters where two tags could describe the same distance: a problem
## about counting back that was missed by one is a counting-back slip, and
## saying so is more use than the generic "off by one".
const BY_ONE_TAGS := ["counting_back_error", "counting_on_error", "off_by_one"]
const BY_TEN_TAGS := ["place_value_slip", "forgot_carry", "borrow_slip"]


## The i18n key for a hint about THIS miss, or "" when the miss says nothing
## identifiable. Callers fall back to the problem's authored hint.
static func hint_key(problem: Dictionary, tapped: Variant) -> String:
	var tag := identify(problem, tapped)
	return "" if tag == "" else "math.miss.%s" % tag


## The misconception this miss demonstrates, or "" if it demonstrates none.
##
## Static and pure so the rule can be tested against the real pools without a
## board: godot/tests/test_math_misconception.gd walks every authored problem.
static func identify(problem: Dictionary, tapped: Variant) -> String:
	var declared: Array = problem.get("misconceptionTags", [])
	if declared.is_empty():
		return ""
	var answer: Dictionary = problem.get("answer", {})
	var correct: Variant = answer.get("correct", null)
	if not _is_number(correct) or not _is_number(tapped):
		return ""
	var right := int(correct)
	var chose := int(tapped)
	if chose == right:
		return ""

	var gap: int = absi(chose - right)
	if gap == 1:
		return _first_declared(declared, BY_ONE_TAGS)
	if gap == 10:
		return _first_declared(declared, BY_TEN_TAGS)
	# A factor of ten out: the digits are right and the size is not.
	if right != 0 and (chose == right * 10 or right == chose * 10):
		return _first_declared(declared, ["magnitude_slip", "place_value_slip"])
	# Two digits read the wrong way round -- 21 for 12. Same digits, so it is a
	# place-value read rather than an arithmetic slip.
	if _digits_reversed(right, chose):
		return _first_declared(declared, ["place_value_slip"])
	return ""


## The first of `candidates` this problem actually declares. The author's list is
## the authority on what this problem can produce; the arithmetic above only says
## which of them it was.
static func _first_declared(declared: Array, candidates: Array) -> String:
	for tag in candidates:
		if declared.has(tag):
			return tag
	return ""


static func _digits_reversed(a: int, b: int) -> bool:
	if a < 10 or a > 99 or b < 10 or b > 99:
		return false
	return a == (b % 10) * 10 + b / 10


static func _is_number(v: Variant) -> bool:
	return typeof(v) == TYPE_INT or typeof(v) == TYPE_FLOAT
