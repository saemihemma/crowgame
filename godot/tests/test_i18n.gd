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

## ── math phrasing ─────────────────────────────────────────────────────────
## The pools ask their questions in English at prompt.text, and that field has to
## stay English: the arithmetic verifier parses its operands, the replay key tests
## it with literal English prefixes, and the golden fixtures compare it byte for
## byte. Localisation is a render-time overlay through an optional `phrasing`
## sibling, so these check the overlay -- not the data.

func test_named_parameter_substitution() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("TextManager")
	var prev: String = tm.get_locale()
	tm.set_locale("en")
	assert_eq(tm.tp("math.prompt.arith.what_is", {"a": 3, "op": "+", "b": 4}),
		"What is 3 + 4?", "named params substitute by name")
	tm.set_locale("is")
	assert_eq(tm.tp("math.prompt.arith.what_is", {"a": 3, "op": "+", "b": 4}),
		"Hvað er 3 + 4?", "the Icelandic template serves the same params")
	tm.set_locale(prev)

## A repeated placeholder must be filled at every occurrence, not just the first.
## "Teldu {step} og {step}!" is the idiomatic Icelandic for "Count by {step}s!",
## so a first-occurrence-only replace would render "Teldu 2 og {step}!".
func test_repeated_placeholder_is_filled_everywhere() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("TextManager")
	var prev: String = tm.get_locale()
	tm.set_locale("is")
	var out: String = tm.tp("math.hint.count_by", {"step": 2})
	assert_eq(out, "Teldu 2 og 2!", "every occurrence of {step} is substituted")
	assert_true(not out.contains("{"), "no placeholder survives substitution")
	tm.set_locale(prev)

## A prefixed prompt is one template wrapping another, so the params carry a
## nested phrasing rather than a pre-rendered English string. Without recursion
## the child would read "Blandað dæmi: {inner}".
func test_nested_phrasing_renders_recursively() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("TextManager")
	var prev: String = tm.get_locale()
	tm.set_locale("is")
	var out: String = tm.tp("math.prompt.wrap.borrow_solve", {
		"inner": {
			"key": "math.prompt.arith.how_much",
			"params": {"a": 18, "op": "-", "b": 9},
		},
	})
	assert_eq(out, "Taktu lán og reiknaðu: Hvað verður 18 - 9?", "nested phrasing renders")
	tm.set_locale(prev)

## An unknown key must return empty so the caller can fall back to the pool's
## English. Returning the key itself would put "math.prompt.arith.nope" on the
## board in front of a child.
func test_unknown_phrasing_key_returns_empty() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("TextManager")
	assert_eq(tm.tp("math.prompt.arith.does_not_exist", {"a": 1}), "",
		"an unresolvable key yields empty, not the raw key")

## Every phrasing key the pools reference must exist in both bundles. A missing
## one is not fatal at runtime -- it falls back to English -- but it means a
## child is reading English inside an Icelandic game, which is the whole thing
## this was built to fix.
func test_every_pool_phrasing_key_exists_in_both_bundles() -> void:
	var en := _load("res://data/i18n/strings_en.json")
	var is_ := _load("res://data/i18n/strings_is.json")
	var pools := ["problems_easy", "problems_dataset", "problems_gaps", "problems_curriculum"]
	var keys := {}
	for pool in pools:
		var data := _load("res://data/math/%s.json" % pool)
		for problem: Variant in data.get("problems", []):
			var phrasing: Variant = (problem as Dictionary).get("phrasing", null)
			if not (phrasing is Dictionary):
				continue
			for field: Variant in (phrasing as Dictionary).keys():
				_collect_keys((phrasing as Dictionary)[field], keys)
	assert_true(keys.size() > 0, "the pools carry phrasing references at all")
	for key: Variant in keys.keys():
		assert_true(en.has(key), "EN bundle has phrasing key '%s'" % key)
		assert_true(is_.has(key), "IS bundle has phrasing key '%s'" % key)


func _collect_keys(ref: Variant, out: Dictionary) -> void:
	if not (ref is Dictionary) or not (ref as Dictionary).has("key"):
		return
	out[String((ref as Dictionary)["key"])] = true
	for value: Variant in (ref as Dictionary).get("params", {}).values():
		if value is Dictionary:
			_collect_keys(value, out)
