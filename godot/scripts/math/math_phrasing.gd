extends RefCounted
class_name MathPhrasing
## One of a problem's three sentences -- prompt, hint, explanation -- in the
## active locale.
##
## The pools keep prompt.text, hint and explanation in canonical English because
## tools/math_verifier.ts parses the operands out of prompt.text, the replay key
## tests it with literal English prefixes, and the golden fixtures compare it byte
## for byte. Localisation is an overlay: an optional `phrasing` sibling naming an
## i18n key, its numeric parameters and, where the wording inflects, the parameter
## that drives plural agreement. Anything unresolvable falls back to the English,
## so a child sees their own language or they see English, never a raw key.
##
## LIFTED OUT OF math_challenge.gd, which is where it lived and where it was the
## only copy. The grown-up report now has to render the same sentence -- a
## parent's log of "what was actually asked" is worthless in a language the
## family does not read -- and a second implementation of this rule would be a
## second place for the fallback chain to be subtly wrong. The board still calls
## it; it simply no longer owns it.

static func localise(problem: Dictionary, field: String) -> String:
	var english := ""
	if field == "prompt":
		var prompt: Variant = problem.get("prompt", {})
		english = String((prompt as Dictionary).get("text", "")) if prompt is Dictionary else ""
	else:
		english = String(problem.get(field, ""))

	var phrasing: Variant = problem.get("phrasing", null)
	if not (phrasing is Dictionary):
		return english
	var ref: Variant = (phrasing as Dictionary).get(field, null)
	if not (ref is Dictionary) or not (ref as Dictionary).has("key"):
		return english

	var entry := ref as Dictionary
	var rendered := TextManager.tp(
		String(entry["key"]),
		entry.get("params", {}),
		String(entry.get("plural", "")),
	)
	return english if rendered.is_empty() else rendered
