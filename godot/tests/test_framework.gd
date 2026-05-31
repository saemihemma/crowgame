extends RefCounted
class_name TestCase
## Minimal zero-dependency assertion harness for headless GDScript tests.
##
## Subclass it, add methods named `test_*`, and the runner discovers and runs
## them. Assertions accumulate failures so a whole suite reports at once.
## Chosen over GUT to keep the project plugin-free and CI-friendly
## (`godot --headless --script res://tests/test_runner.gd`).

var _failures: Array[String] = []
var _assertions := 0

func failures() -> Array[String]:
	return _failures

func assertion_count() -> int:
	return _assertions

func _fail(msg: String) -> void:
	_failures.append(msg)

func assert_true(cond: bool, msg: String = "") -> void:
	_assertions += 1
	if not cond:
		_fail("assert_true failed: %s" % msg)

func assert_eq(actual, expected, msg: String = "") -> void:
	_assertions += 1
	# Short-circuit on type mismatch so comparing e.g. String vs bool can't throw.
	if typeof(actual) != typeof(expected) or actual != expected:
		_fail("assert_eq failed: %s (got %s, expected %s)" % [msg, str(actual), str(expected)])

func assert_almost_eq(actual: float, expected: float, tol: float = 0.0001, msg: String = "") -> void:
	_assertions += 1
	if absf(actual - expected) > tol:
		_fail("assert_almost_eq failed: %s (got %f, expected %f, tol %f)" % [msg, actual, expected, tol])
