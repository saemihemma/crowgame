extends RefCounted
class_name GoldenRoll
## Godot port of src/math/goldenRoll.ts. Decides whether an owl problem
## arrives golden — deterministic given (childId, lifetime attempt index),
## so both ports roll identically from the same save state (covered by the
## golden_roll fixtures in test_math_parity.gd). Never tied to time or
## streaks: a seeded coin flip at the tuned rate, nothing more.

## FNV-1a 32-bit; & 0xFFFFFFFF keeps the exact low 32 bits of the product,
## matching the web port's Math.imul.
static func _fnv1a32(key: String) -> int:
	var h := 0x811c9dc5
	for i in key.length():
		h = h ^ key.unicode_at(i)
		h = (h * 0x01000193) & 0xFFFFFFFF
	return h

## Extra avalanche round so consecutive indices decorrelate (mirrors the TS).
static func _avalanche(hash_value: int) -> int:
	var h := hash_value & 0xFFFFFFFF
	h = h ^ (h >> 16)
	h = (h * 0x7feb352d) & 0xFFFFFFFF
	h = h ^ (h >> 15)
	h = (h * 0x846ca68b) & 0xFFFFFFFF
	h = h ^ (h >> 16)
	return h

## Uniform [0,1) draw for this child at this lifetime attempt index.
static func golden_draw(child_id: String, attempt_index: int) -> float:
	return _avalanche(_fnv1a32("%s:%d" % [child_id, attempt_index])) / 4294967296.0

static func is_golden_encounter(child_id: String, attempt_index: int, rate: float) -> bool:
	return golden_draw(child_id, attempt_index) < rate
