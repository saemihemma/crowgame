extends TestCase
## Slice 2 smoke test: every JSON loads, the math pools total what we expect,
## and the core autoloads behave (save round-trip, profile PIN, i18n, levels).

func _reset() -> void:
	_failures.clear()
	_assertions = 0

func _root() -> Node:
	return Engine.get_main_loop().root

func test_autoloads_present() -> void:
	for name in ["Persistence", "EventBus", "DataManager", "ProfileManager", "SaveManager", "TextManager", "LevelManager", "LevelingManager", "ThemeManager", "AudioManager"]:
		assert_true(_root().get_node_or_null(NodePath(name)) != null, "autoload %s present" % name)

func test_all_data_files_loaded() -> void:
	var dm: Node = _root().get_node("DataManager")
	for key in dm.PATHS.keys():
		assert_true(dm.get_data(key) != null, "data loaded: %s" % key)

func test_math_pool_count() -> void:
	var dm: Node = _root().get_node("DataManager")
	var n: int = dm.get_total_problem_count()
	# Inventory expectation: easy 15 + dataset 40 + gaps 60 + curriculum 2885 = 3000.
	assert_true(n >= 2900, "math problem count plausible (got %d, expect ~3000)" % n)

func test_level_registry_sorted() -> void:
	var lm: Node = _root().get_node("LevelManager")
	var levels: Array = lm.get_levels()
	assert_true(levels.size() >= 1, "levels present")
	var prev := -9999
	for l in levels:
		var ord := int(l.get("order", 0))
		assert_true(ord >= prev, "levels sorted by order")
		prev = ord

func test_text_substitution() -> void:
	var tm: Node = _root().get_node("TextManager")
	# strings_en has "hud.coins": "x{0}".
	assert_eq(tm.t("hud.coins", [7]), "x7", "i18n substitution")
	assert_eq(tm.t("__missing_key__"), "__missing_key__", "missing key returns key")

func test_profile_pin_hash_and_login() -> void:
	var pm: Node = _root().get_node("ProfileManager")
	var uname := "Kid%d" % (randi() % 1000)
	var res = pm.create_profile(uname, "1234")
	assert_eq(res, true, "create_profile ok")
	assert_eq(pm.login(uname, "0000"), false, "wrong pin rejected")
	assert_eq(pm.login(uname, "1234"), true, "correct pin accepted")
	assert_eq(pm.create_profile("x", "12"), "PIN must be exactly 4 digits", "pin validation")
	pm.delete_profile(uname)

func test_save_default_shape_and_roundtrip() -> void:
	var sm: Node = _root().get_node("SaveManager")
	var data: Dictionary = sm.get_data()
	for k in ["version", "currentLevel", "coins", "stars", "owlsSaved", "xp", "playerLevel", "mathStats", "telemetry", "settings"]:
		assert_true(data.has(k), "save has key %s" % k)
	assert_eq(int(data["version"]), 1, "save version")
	var before := int(data["coins"])
	sm.add_coins(5)
	assert_eq(int(sm.get_data()["coins"]), before + 5, "add_coins persists in-memory")
	sm.add_coins(-5)  # restore
