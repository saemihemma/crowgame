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
	# Asserts the switch works, not what the buttons say. Pinning the exact copy
	# here meant every wording change broke a test about locale plumbing - and
	# the copy that was pinned ("> SPILA") was placeholder ASCII no one wanted to
	# keep. The Icelandic wording that genuinely must not drift is pinned in
	# test_icelandic_corrections instead.
	tm.set_locale("is")
	var is_play: String = tm.t("menu.play")
	assert_true(is_play != "" and is_play != "menu.play", "IS value served when locale=is")
	assert_eq(tm.t("login.hi", ["Ada"]), "Hæ, Ada!", "IS substitution works")
	tm.set_locale("en")
	var en_play: String = tm.t("menu.play")
	assert_true(en_play != "" and en_play != "menu.play", "EN value served when locale=en")
	assert_true(en_play != is_play, "the two locales serve different values for the same key")
	# Unknown locale falls back to English.
	tm.set_locale("zz")
	assert_eq(tm.get_locale(), "en", "unknown locale -> en")
	assert_eq(tm.t("pause.title"), "PAUSED", "english fallback intact")
	tm.set_locale(prev)

## The corrections from the Icelandic review. Pinned so a future edit cannot
## silently reintroduce them.
func test_icelandic_corrections() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("TextManager")
	var prev: String = tm.get_locale()
	tm.set_locale("is")
	# `bjarga` governs the dative, so the passive participle stays neuter and
	# indeclinable -- "Uglur bjargaðar" is the learner error this replaced.
	assert_eq(tm.t("game.completion_stats", [3, 40]), "Uglum bjargað: 3   Mynt: 40", "dative passive for bjarga")
	assert_eq(tm.t("game.owl_saved"), "Uglu bjargað!", "singular dative passive matches")
	# "Í bið" is queue/on-hold register; "Hlé" is the cinema-intermission word.
	assert_eq(tm.t("pause.title"), "HLÉ", "pause uses the everyday word")
	# `hjálpa` needs its dative object.
	assert_eq(tm.t("math.greeting_3"), "Geturðu hjálpað mér með þetta?", "hjalpa keeps its dative object")
	# Must not collide with pause.resume.
	assert_true(tm.t("menu.continue") != tm.t("pause.resume"), "continue and resume read differently")
	tm.set_locale(prev)


## No string in either locale may need a glyph above Latin-1: that is the block
## Godot's built-in font covers, and the block the old PIN dots (U+25CF) sat
## outside of.
func test_no_glyphs_above_latin1() -> void:
	for path in ["res://data/i18n/strings_en.json", "res://data/i18n/strings_is.json"]:
		var bundle := _load(path)
		for key in bundle:
			for c in String(bundle[key]):
				assert_true(c.unicode_at(0) <= 0xFF, "%s [%s] stays within Latin-1" % [path, key])


## Every locale names itself in its own language, never translated.
func test_endonyms_present() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("TextManager")
	for code in tm.available_locales():
		assert_true(tm.endonym(String(code)) != String(code), "locale '%s' has an endonym" % code)
	assert_eq(tm.endonym("is"), "Íslenska", "Icelandic names itself Íslenska")
