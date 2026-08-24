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

## Plural agreement. Icelandic follows the numeral: 1 -- and 21, 31, anything
## ending in 1 except 11 -- takes the singular. English inflects at 1 only. The
## data names the driving parameter and each locale applies its own rule, so
## these check that the rules really are different and really are applied.
func test_plural_agreement_per_locale() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("TextManager")
	var prev: String = tm.get_locale()

	tm.set_locale("is")
	assert_eq(tm.tp("math.expl.mul", {"a": 3, "b": 4, "product": 12}, "a"),
		"3 hópar af 4 gera 12.", "plural form at 3")
	assert_eq(tm.tp("math.expl.mul", {"a": 1, "b": 2, "product": 2}, "a"),
		"1 hópur af 2 gerir 2.", "singular form at 1, verb included")
	assert_eq(tm.tp("math.expl.total", {"n": 21}, "n"),
		"Það er 21 í allt.", "Icelandic takes the singular at 21")
	assert_eq(tm.tp("math.expl.total", {"n": 11}, "n"),
		"Það eru 11 í allt.", "but not at 11")

	tm.set_locale("en")
	assert_eq(tm.tp("math.expl.total", {"n": 21}, "n"),
		"There are 21 altogether.", "English stays plural at 21")
	assert_eq(tm.tp("math.expl.total", {"n": 1}, "n"),
		"There is 1 altogether.", "English inflects at 1")
	tm.set_locale(prev)

## Without the marker there is nothing to inflect on, so the base form must come
## back rather than a missing-key empty string.
func test_missing_plural_marker_falls_back_to_base_form() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("TextManager")
	var prev: String = tm.get_locale()
	tm.set_locale("is")
	assert_eq(tm.tp("math.expl.mul", {"a": 1, "b": 2, "product": 2}),
		"1 hópar af 2 gera 2.", "no marker means no inflection, not an empty string")
	tm.set_locale(prev)

## Every plural-sensitive key the pools reference must have a `.one` form in both
## bundles, or a child sees "1 hópar af 2" at exactly the value that matters.
func test_plural_keys_have_singular_forms() -> void:
	var en := _load("res://data/i18n/strings_en.json")
	var is_ := _load("res://data/i18n/strings_is.json")
	var pools := ["problems_easy", "problems_dataset", "problems_gaps", "problems_curriculum"]
	var plural_keys := {}
	for pool in pools:
		var data := _load("res://data/math/%s.json" % pool)
		for problem: Variant in data.get("problems", []):
			var phrasing: Variant = (problem as Dictionary).get("phrasing", null)
			if not (phrasing is Dictionary):
				continue
			for field: Variant in (phrasing as Dictionary).keys():
				var ref: Variant = (phrasing as Dictionary)[field]
				if ref is Dictionary and String((ref as Dictionary).get("plural", "")) != "":
					plural_keys[String((ref as Dictionary)["key"])] = true
	assert_true(plural_keys.size() > 0, "the pools mark plural-sensitive phrasings")
	for key: Variant in plural_keys.keys():
		assert_true(en.has("%s.one" % key), "EN has singular form for '%s'" % key)
		assert_true(is_.has("%s.one" % key), "IS has singular form for '%s'" % key)

## ── live re-render on a locale change ─────────────────────────────────────
## TextManager.locale_changed was emitted and had zero listeners: dead plumbing
## that read as if mid-game switching worked. The Pause menu now switches
## language in place, which only works if the live surfaces are actually
## subscribed.
##
## An earlier version of these two tests PASSED with the HUD's connection
## deleted -- one because any other subscriber satisfied "someone is listening",
## the other because "the text changed" can be true for reasons that have nothing
## to do with the locale. Both now name the HUD and name the words.

func test_hud_itself_subscribes_to_locale_changed() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("TextManager")
	var hud: Node = preload("res://scenes/Hud.tscn").instantiate()
	Engine.get_main_loop().root.add_child(hud)
	await Engine.get_main_loop().process_frame

	var mine := 0
	for conn: Dictionary in tm.locale_changed.get_connections():
		var callable: Callable = conn["callable"]
		if callable.get_object() == hud:
			mine += 1
	assert_true(mine > 0,
		"the HUD instance is itself a locale_changed subscriber — counting all "
		+ "subscribers instead would pass on somebody else's connection")

	hud.queue_free()
	await Engine.get_main_loop().process_frame


## The three counters are what actually differ between locales, so assert the
## words rather than that something moved.
func test_hud_counters_follow_the_locale_without_a_reload() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("TextManager")
	var prev: String = tm.get_locale()
	var hud: Node = preload("res://scenes/Hud.tscn").instantiate()
	Engine.get_main_loop().root.add_child(hud)
	await Engine.get_main_loop().process_frame

	tm.set_locale("en")
	await Engine.get_main_loop().process_frame
	var english := _hud_text(hud)
	assert_true(english.contains("Coins") and english.contains("Owls"),
		"the HUD renders its English counters (got '%s')" % english)

	tm.set_locale("is")
	await Engine.get_main_loop().process_frame
	var icelandic := _hud_text(hud)
	assert_true(icelandic.contains("Mynt") and icelandic.contains("Uglur"),
		"the HUD counters became Icelandic in place, with no reload (got '%s')" % icelandic)
	assert_true(not icelandic.contains("Coins"),
		"no English counter survives the switch (got '%s')" % icelandic)

	tm.set_locale(prev)
	hud.queue_free()
	await Engine.get_main_loop().process_frame


func _hud_text(node: Node) -> String:
	var parts: Array[String] = []
	for child in node.find_children("*", "Label", true, false):
		var l := child as Label
		if l.text != "":
			parts.append(l.text)
	parts.sort()
	return " | ".join(parts)
