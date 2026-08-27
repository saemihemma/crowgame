extends Node
## Headless test runner (scene-based). Run as the main scene so autoloads
## initialize (their _ready fires) BEFORE this node's _ready — a custom
## SceneTree via --script would quit before the first frame and skip autoload
## _ready, so we run under the normal main loop instead.
##
## Usage: godot --headless --path godot res://tests/TestRunner.tscn
## Exits non-zero if any assertion fails, so CI can gate on it.

const TESTS_DIR := "res://tests"
const SKIP := ["test_framework.gd", "test_runner.gd"]

func _ready() -> void:
	# Defer one frame so the root scene finishes setup; tests may add live nodes
	# (e.g. the Game scene) to the tree, which fails while root is "busy".
	await get_tree().process_frame
	await get_tree().process_frame
	await _run()

func _run() -> void:
	var total_pass := 0
	var total_fail := 0
	var suites := _discover()
	print("\n=== Hörmann GDScript test runner — %d suite(s) ===" % suites.size())

	for path in suites:
		var script: GDScript = load(path)
		# can_instantiate(), not just null. A test file with a PARSE ERROR loads to
		# a non-null GDScript that cannot be instantiated, so `script.new()` threw
		# "Nonexistent function 'new'" -- and the runner then hung instead of
		# exiting, which in CI is a ten-minute timeout with no failing test named.
		# One typo in one test file could stall the whole suite.
		if script == null or not script.can_instantiate():
			printerr("  ! could not load %s (parse error?)" % path)
			total_fail += 1
			continue
		var instance: Object = script.new()
		var suite_name := path.get_file()
		for method in instance.get_method_list():
			var mname: String = method.name
			if not mname.begins_with("test_"):
				continue
			# Optional per-test setup. Four suites use it for real work — lazily
			# parsing a fixture or a compiled level, and clearing the learner
			# store between tests — so this is what keeps those independent of
			# each other. It runs BEFORE the deltas below are read.
			if instance.has_method("_reset"):
				instance.call("_reset")
			var before: int = instance.failures().size()
			var asserts_before: int = instance.assertion_count()
			# AWAITED, deliberately. `instance.call(mname)` alone returns at the
			# test's first `await`, so the failure count below was read before the
			# rest of the test had run -- every assertion after a frame boundary
			# went uncounted and the test passed vacuously. Five tests across
			# three suites were affected, including the one asserting that a real
			# touch presses the d-pad action, which is load-bearing evidence.
			#
			# Awaiting a non-coroutine is harmless in Godot 4: the value comes
			# straight back.
			@warning_ignore("redundant_await")
			await instance.call(mname)
			var after: int = instance.failures().size()

			# A test that asserts NOTHING passes, and looks identical to one that
			# works. This repo has already been bitten by exactly that: the
			# `await` note above describes five tests across three suites that
			# ran their assertions after a frame boundary and were counted as
			# passing while proving nothing. Reported, not failed, so a suite
			# that is legitimately structural stays green while the vacuum is
			# still visible in the log.
			if instance.assertion_count() == asserts_before:
				print("  [vacuous] %s::%s asserted nothing" % [suite_name, mname])

			if after > before:
				total_fail += 1
				print("  [FAIL] %s::%s" % [suite_name, mname])
				for i in range(before, after):
					print("         %s" % instance.failures()[i])
			else:
				total_pass += 1
				print("  [pass] %s::%s" % [suite_name, mname])

	print("\n=== %d passed, %d failed ===\n" % [total_pass, total_fail])
	get_tree().quit(1 if total_fail > 0 else 0)

func _discover() -> Array[String]:
	var found: Array[String] = []
	var dir := DirAccess.open(TESTS_DIR)
	if dir == null:
		return found
	dir.list_dir_begin()
	var fname := dir.get_next()
	while fname != "":
		if not dir.current_is_dir() and fname.begins_with("test_") and fname.ends_with(".gd") and not SKIP.has(fname):
			found.append("%s/%s" % [TESTS_DIR, fname])
		fname = dir.get_next()
	dir.list_dir_end()
	found.sort()
	return found
