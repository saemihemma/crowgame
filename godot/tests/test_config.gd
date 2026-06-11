extends TestCase
## Phase 0.5: Config autoload returns JSON tuning values via slash paths, with
## graceful fallback for missing keys. Asserts against the JSON directly so
## routine tuning changes never break the test (we test wiring, not values).

func _reset() -> void:
	_failures.clear()
	_assertions = 0

func _cfg() -> Node:
	return Engine.get_main_loop().root.get_node("Config")

func _load(path: String) -> Dictionary:
	var f := FileAccess.open(path, FileAccess.READ)
	var d: Dictionary = JSON.parse_string(f.get_as_text())
	f.close()
	return d

func test_ui_values_match_json() -> void:
	var c := _cfg()
	var ui := _load("res://data/tuning/ui_tuning.json")
	assert_almost_eq(float(c.ui("touch/button_size")), float(ui["touch"]["button_size"]), 0.001, "touch size wired from json")
	assert_almost_eq(float(c.ui("math_challenge/correct_delay")), float(ui["math_challenge"]["correct_delay"]), 0.001, "math delay wired")
	assert_eq((c.ui("hud/coin_milestones") as Array).size(), (ui["hud"]["coin_milestones"] as Array).size(), "milestone array wired")

func test_fx_values_match_json() -> void:
	var c := _cfg()
	var fx := _load("res://data/tuning/fx_tuning.json")
	assert_almost_eq(float(c.fx("shake/strength")), float(fx["shake"]["strength"]), 0.001, "fx shake strength wired")
	assert_almost_eq(float(c.fx("burst/coin")), float(fx["burst"]["coin"]), 0.001, "nested fx burst wired")

func test_missing_key_returns_default() -> void:
	var c := _cfg()
	assert_eq(c.ui("nope/missing", 42), 42, "missing path -> default")
	assert_eq(c.fx("also/missing"), null, "missing path -> null when no default")
	assert_true(c.get_value("UI_TUNING", "touch/gap", 0) != 0, "generic get_value resolves a real value")
