extends RefCounted
class_name ProblemReplayKey
## Godot port of math-kernel/math/problemReplayKey.ts. Pure, static helpers.
## Builds an anti-repeat key that treats commutative facts (a+b == b+a,
## a×b == b×a) as identical, and normalizes counting/comparison/sequence prompts.

static func _normalize_text(text: String) -> String:
	var t := text.strip_edges().to_lower()
	var re := RegEx.new()
	re.compile("\\s+")
	return re.sub(t, " ", true)

static func _parse_arithmetic(text: String) -> Variant:
	# Returns { left:int, operator:String, right:int } or null.
	var re := RegEx.new()
	re.compile("(\\d+)\\s*([+\\-×÷])\\s*(\\d+)")
	var m := re.search(_normalize_text(text))
	if m == null:
		return null
	return {"left": int(m.get_string(1)), "operator": m.get_string(2), "right": int(m.get_string(3))}

static func _extract_numbers(text: String) -> Array:
	var out: Array = []
	var re := RegEx.new()
	re.compile("\\d+")
	for m in re.search_all(_normalize_text(text)):
		out.append(int(m.get_string(0)))
	return out

static func _is_counting_prompt(text: String) -> bool:
	return text.begins_with("how many are here:") or text.begins_with("count these:") or text.begins_with("count the ")

static func _is_comparison_prompt(text: String) -> bool:
	return text.contains("greater") or text.contains("smaller")

static func _correct_str(answer: Dictionary) -> String:
	return str(answer.get("correct", ""))

static func _build_sequence_like_key(problem: Dictionary) -> String:
	var numbers := _extract_numbers(problem.get("prompt", {}).get("text", ""))
	var correct = problem.get("answer", {}).get("correct", null)
	var visible := numbers.duplicate()
	# Number.isFinite(correct): only append when it's a real number.
	if typeof(correct) == TYPE_INT or typeof(correct) == TYPE_FLOAT:
		visible.append(correct)
	elif typeof(correct) == TYPE_STRING and correct.is_valid_float():
		visible.append(float(correct) if "." in correct else int(correct))
	var parts: Array = []
	for v in visible:
		parts.append(str(v))
	return "%s:%s" % [problem.get("domain", ""), ",".join(parts)]

static func build(problem: Dictionary) -> String:
	var prompt_text := String(problem.get("prompt", {}).get("text", ""))
	var domain := String(problem.get("domain", ""))
	var answer: Dictionary = problem.get("answer", {})

	var parsed = _parse_arithmetic(prompt_text)
	if parsed != null:
		var op: String = parsed["operator"]
		if op == "+" or op == "×":
			var lo: int = mini(parsed["left"], parsed["right"])
			var hi: int = maxi(parsed["left"], parsed["right"])
			return "%d %s %d" % [lo, op, hi]
		return "%d %s %d" % [parsed["left"], op, parsed["right"]]

	var text := _normalize_text(prompt_text)

	if domain == "counting" or _is_counting_prompt(text):
		return "count:%s" % _correct_str(answer)

	if domain == "comparison" or _is_comparison_prompt(text):
		var values := _extract_numbers(text)
		if values.size() >= 2:
			var pair := [values[0], values[1]]
			pair.sort()
			return "compare:%d:%d:%s" % [pair[0], pair[1], _correct_str(answer)]

	if domain == "number_sequence" or domain == "pattern_matching":
		return _build_sequence_like_key(problem)

	return text
