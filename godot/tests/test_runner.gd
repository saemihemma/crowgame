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
	var total_pass := 0
	var total_fail := 0
	var suites := _discover()
	print("\n=== Crow GDScript test runner — %d suite(s) ===" % suites.size())

	for path in suites:
		var script: GDScript = load(path)
		if script == null:
			printerr("  ! could not load %s" % path)
			total_fail += 1
			continue
		var instance: Object = script.new()
		var suite_name := path.get_file()
		for method in instance.get_method_list():
			var mname: String = method.name
			if not mname.begins_with("test_"):
				continue
			if instance.has_method("_reset"):
				instance.call("_reset")
			var before: int = instance.failures().size()
			instance.call(mname)
			var after: int = instance.failures().size()
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
