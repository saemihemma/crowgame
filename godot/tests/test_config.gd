extends TestCase
## Phase 0.5: Config autoload returns JSON tuning values via slash paths, with
## graceful fallback for missing keys.

func _reset() -> void:
	_failures.clear()
	_assertions = 0

func _cfg() -> Node:
	return Engine.get_main_loop().root.get_node("Config")

func test_ui_values_from_json() -> void:
	var c := _cfg()
	assert_eq(int(c.ui("touch/button_size")), 88, "touch button size from ui_tuning")
	assert_almost_eq(float(c.ui("math_challenge/correct_delay")), 1.5, 0.0001, "math delay from json")
	assert_eq((c.ui("hud/coin_milestones") as Array).size(), 4, "milestone array loaded")

func test_fx_values_from_json() -> void:
	var c := _cfg()
	assert_almost_eq(float(c.fx("shake/strength")), 6.0, 0.0001, "fx shake strength")
	assert_eq(int(c.fx("burst/coin")), 20, "nested fx burst amount")

func test_missing_key_returns_default() -> void:
	var c := _cfg()
	assert_eq(c.ui("nope/missing", 42), 42, "missing path -> default")
	assert_eq(c.fx("also/missing"), null, "missing path -> null when no default")
	# JSON numbers parse as float in Godot — consumers coerce with int()/float().
	assert_eq(int(c.get_value("UI_TUNING", "touch/gap", 0)), 12, "generic get_value path")
