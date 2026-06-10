extends TestCase
## Phase 0.5: i18n integrity — Icelandic mirrors English key-for-key (lockstep),
## locale switching resolves through the active locale with English fallback.

func _reset() -> void:
	_failures.clear()
	_assertions = 0

func _load(path: String) -> Dictionary:
	var f := FileAccess.open(path, FileAccess.READ)
	var d: Dictionary = JSON.parse_string(f.get_as_text())
	f.close()
	return d

func test_is_mirrors_en_keys() -> void:
	var en := _load("res://data/i18n/strings_en.json")
	var is_ := _load("res://data/i18n/strings_is.json")
	for k in en:
		assert_true(is_.has(k), "IS has EN key '%s'" % k)
	for k in is_:
		assert_true(en.has(k), "IS has no extra key '%s'" % k)

func test_locale_switch_and_fallback() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("TextManager")
	var prev: String = tm.get_locale()
	tm.set_locale("is")
	assert_eq(tm.t("menu.play"), "> SPILA", "IS value served when locale=is")
	assert_eq(tm.t("login.hi", ["Ada"]), "Hæ, Ada!", "IS substitution works")
	tm.set_locale("en")
	assert_eq(tm.t("menu.play"), "> PLAY", "EN value served when locale=en")
	# Unknown locale falls back to English.
	tm.set_locale("zz")
	assert_eq(tm.get_locale(), "en", "unknown locale -> en")
	assert_eq(tm.t("pause.title"), "PAUSED", "english fallback intact")
	tm.set_locale(prev)
