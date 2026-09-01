extends TestCase
## Phase 0.5: i18n integrity — Icelandic mirrors English key-for-key (lockstep),
## locale switching resolves through the active locale with English fallback.


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
	# indeclinable -- "Uglur bjargaðar" is the learner error this replaced. The
	# plural half of this pin lived on game.completion_stats, which the stat
	# medals replaced; you cannot pin grammar in a string nobody renders.
	assert_eq(tm.t("game.owl_saved"), "Uglu bjargað!", "dative passive for bjarga")
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

## The two UI counters that carry a number a child can read.
##
## Both shipped through t(), which has no plural path, so Icelandic read
## "1 uglur heima" and "10 mynt!" -- singular noun on a plural count, and the
## reverse. The maths pools have had per-locale agreement since the phrasing
## overlay landed; these two were the surfaces it never reached.
func test_ui_counters_agree_with_their_number() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("TextManager")
	var prev: String = tm.get_locale()

	tm.set_locale("is")
	assert_eq(tm.tp("hud.coins_milestone", {"n": 10}, "n"), "10 myntir!", "plural noun at 10")
	assert_eq(tm.tp("hud.coins_milestone", {"n": 1}, "n"), "1 mynt!", "singular at 1")
	assert_eq(tm.tp("hud.coins_milestone", {"n": 21}, "n"), "21 mynt!", "Icelandic singular at 21")
	assert_eq(tm.tp("hud.coins_milestone", {"n": 11}, "n"), "11 myntir!", "but not at 11")
	# The owl count. This used to be pinned on menu.continue_detail, the caption
	# under the menu's Play row -- and that row is gone: PLAY opens the map now,
	# which is where "where was I" belongs. The same rule this file states two
	# tests up applies to its own pins: you cannot pin grammar in a string nobody
	# renders. The locked-door card is where a child meets an owl count now, and
	# it inflects in the dative, which `bjarga` governs.
	assert_eq(tm.tp("door.locked", {"n": 4}, "n"),
		"Bjargaðu 4 uglum í viðbót!", "plural owls, dative")
	assert_eq(tm.tp("door.locked", {"n": 1}, "n"),
		"Bjargaðu 1 uglu í viðbót!", "singular owl, dative")

	tm.set_locale("en")
	assert_eq(tm.tp("hud.coins_milestone", {"n": 21}, "n"), "21 coins!", "English stays plural at 21")
	assert_eq(tm.tp("hud.coins_milestone", {"n": 1}, "n"), "1 coin!", "English inflects at 1")
	tm.set_locale(prev)

## One word for the currency. It was "Peningar" on the completion medal, "MYNT"
## on the streak toast and "mynt" on the milestone -- three words for the coins
## in one game.
##
## The streak toast is no longer in this list, and that is the point of the next
## test: it named the currency because it claimed to multiply it, and it does not.
func test_icelandic_currency_is_one_word() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("TextManager")
	var prev: String = tm.get_locale()
	tm.set_locale("is")
	for key in ["game.stat_coins", "hud.coins_milestone"]:
		assert_true(tm.t(key).to_lower().contains("mynt"),
			"[%s] names the currency 'mynt', got '%s'" % [key, tm.t(key)])
	tm.set_locale(prev)


## The streak toast must not promise a reward the game does not pay.
##
## It read "x{0} COINS!" / "x{0} MYNTIR!" and fired at every third correct answer,
## while no coin path anywhere reads `streak` -- an owl coin is `coin_count += 1`,
## an enemy drop adds its own `amount`. So a child was told "x3 COINS!" and given
## one coin. In a product built on the reward being real, a lying reward is worse
## than no reward.
##
## Gated in both locales and on both toast strings, because the "ON FIRE! x{0}"
## variant carried the same "x" and would have kept the claim alive.
func test_streak_toast_promises_no_currency() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("TextManager")
	var prev: String = tm.get_locale()
	for locale in ["en", "is"]:
		tm.set_locale(locale)
		for key in ["fx.streak_count", "fx.streak_on_fire"]:
			var text: String = tm.t(key, [3]).to_lower()
			assert_true(text != "",
				"[%s/%s] must exist -- an empty string here makes this test vacuous"
				% [locale, key])
			for word in ["coin", "mynt", "x3"]:
				assert_true(not text.contains(word),
					"[%s/%s] must not promise currency or a multiplier, got '%s'"
					% [locale, key, text])
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


## The HUD is wordless now, so this asserts the wiring rather than the wording.
##
## It used to assert that the HUD rendered "Coins"/"Owls" and then "Mynt"/
## "Uglur". Those three text counters no longer exist: the HUD is a heart row, a
## coin chip and an owl ring, because Gate B6 says nothing may carry essential
## meaning by words alone to a player who is still learning to read. The only
## text left is the chip's count, and its format string is identical in both
## bundles ("x{0}"), so there is no visible difference to assert.
##
## What is still worth protecting is that the count comes from the string table
## at all - a hardcoded "x" + str(n) would look right and be unlocalisable. Read
## together with test_hud_itself_subscribes_to_locale_changed, which proves the
## HUD is listening, that is the whole invariant the old test stood for.
func test_hud_counter_renders_through_the_string_table() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("TextManager")
	var prev: String = tm.get_locale()
	var hud: Node = preload("res://scenes/Hud.tscn").instantiate()
	Engine.get_main_loop().root.add_child(hud)
	await Engine.get_main_loop().process_frame

	var coins := int(SaveManager.get_data().get("coins", 0))
	for locale in ["en", "is"]:
		tm.set_locale(locale)
		EventBus.coins_changed.emit(coins)
		await Engine.get_main_loop().process_frame
		# Explicit type: `tm` is a Node here, so t() is a Variant call and := has
		# nothing to infer from.
		var expected: String = tm.t("hud.coins", [coins])
		assert_true(_hud_text(hud).contains(expected),
			"[%s] the HUD shows the coin count from the string table ('%s'), got '%s'"
				% [locale, expected, _hud_text(hud)])

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
