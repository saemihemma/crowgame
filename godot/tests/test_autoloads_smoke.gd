extends TestCase
## Slice 2 smoke test: every JSON loads, the math pools total what we expect,
## and the core autoloads behave (save round-trip, profile PIN, i18n, levels).


func _root() -> Node:
	return Engine.get_main_loop().root

func test_autoloads_present() -> void:
	for name in ["Persistence", "EventBus", "DataManager", "ProfileManager", "SaveManager", "TextManager", "LevelManager", "LevelingManager", "ThemeManager", "AudioManager"]:
		assert_true(_root().get_node_or_null(NodePath(name)) != null, "autoload %s present" % name)

func test_all_data_files_loaded() -> void:
	var dm: Node = _root().get_node("DataManager")
	for key in dm.PATHS.keys():
		assert_true(dm.get_data(key) != null, "data loaded: %s" % key)

## DataManager must expose every problem the four pools hold.
##
## This asserted `n >= 2900` against a comment claiming a 3000 total. The real
## total is larger, so the floor had drifted roughly 250 problems clear of the
## data and would still have passed with an entire pool missing. The exact counts
## are already gated by `npm run validate:docs`, which derives them from the same
## JSON — so what is worth asserting HERE, and only here, is the runtime wiring:
## that loading through the autoload loses nothing. Summing the files makes that
## self-updating.
func test_math_pool_count_matches_the_pools_on_disk() -> void:
	var dm: Node = _root().get_node("DataManager")
	var expected := 0
	for pool in ["problems_easy", "problems_dataset", "problems_gaps", "problems_curriculum"]:
		var f := FileAccess.open("res://data/math/%s.json" % pool, FileAccess.READ)
		assert_true(f != null, "%s.json is readable" % pool)
		if f == null:
			continue
		var parsed: Variant = JSON.parse_string(f.get_as_text())
		f.close()
		expected += (parsed.get("problems", []) as Array).size()
	assert_true(expected > 0, "the pools on disk are not empty")
	assert_eq(dm.get_total_problem_count(), expected,
		"DataManager serves every problem the four pools hold")

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
	assert_eq(pm.create_profile("x", "12"), "login.pin_four_digits", "pin validation")
	pm.delete_profile(uname)

## Every rejection reason must be a key the string table can actually resolve.
##
## Returning the English sentence looked identical on screen in English and put
## untranslated English in front of an Icelandic child. Asserting only that a
## rejection happened would not have caught that, so this asserts the value is a
## key AND that both locales serve real copy for it.
func test_create_profile_rejections_are_resolvable_keys() -> void:
	var pm: Node = _root().get_node("ProfileManager")
	var tm: Node = _root().get_node("TextManager")
	var taken := "Dup%d" % (randi() % 1000)
	assert_eq(pm.create_profile(taken, "1234"), true, "seed profile for the taken-name case")

	var rejections := {
		"empty name": pm.create_profile("   ", "1234"),
		"long name": pm.create_profile("x".repeat(pm.NAME_MAX_LENGTH + 1), "1234"),
		"short pin": pm.create_profile("Someone", "12"),
		"taken name": pm.create_profile(taken.to_lower(), "1234"),
	}
	var prev: String = tm.get_locale()
	for case: String in rejections:
		var key: Variant = rejections[case]
		assert_true(key is String, "%s is rejected with a key, not true" % case)
		for locale in ["en", "is"]:
			tm.set_locale(locale)
			var copy: String = tm.t(String(key))
			assert_true(copy != "" and copy != String(key),
				"[%s] %s resolves '%s' to real copy, got '%s'" % [locale, case, key, copy])
	tm.set_locale(prev)
	pm.delete_profile(taken)

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
