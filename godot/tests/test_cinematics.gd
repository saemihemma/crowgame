extends TestCase
## The opening film, held to its contract from inside the engine.
##
## `tools/validate_cinematics.mjs` already proves the geometry, the byte budget
## and the caption bundles without booting Godot, and it is the better place for
## all of that. This file exists for the three things only a running engine can
## answer:
##
##   1. Every plate is IMPORTED, not merely present on disk. A PNG that exists
##      in the working tree but never made it into the .import (and so never
##      makes it into the .pck) passes the node validator and shows a child an
##      empty shot. `ResourceLoader.exists` is the only check that knows.
##   2. Every caption key actually renders through TextManager, rather than
##      falling through and drawing its own key at a child.
##   3. The scene is reachable by its logical name, because that is how the
##      replay entry point and the boot route will both find it.
##
## Direction: brand/CINEMATIC_DIRECTION.md. Story: brand/STORY_BIBLE.md.

## brand/CINEMATIC_DIRECTION.md 1 rule 6, and 3.1.
const RUNTIME_MAX_SEC := 60.0
const CINE_FADE := 0.9

func _reset() -> void:
	_failures.clear()
	_assertions = 0

func _root() -> Node:
	return Engine.get_main_loop().root

func _prologue() -> Dictionary:
	return DataManager.get_dict("CINEMATIC_PROLOGUE")

## JSON `null` is `null` in GDScript, and `String(null)` throws -- the wordless
## shot has `"caption": null`. cinematic.gd carries the same helper.
func _opt(value: Variant) -> String:
	return "" if value == null else String(value)

func _shots() -> Array:
	var shots: Variant = _prologue().get("shots", [])
	return shots if shots is Array else []


func test_the_scene_is_reachable_by_name() -> void:
	var router: Node = _root().get_node("SceneRouter")
	assert_true(router.has_scene("cinematic"), "'cinematic' is registered in scenes.json")
	assert_true(ResourceLoader.exists(router.path_of("cinematic")), "the Cinematic scene file exists")


## A GDScript that does not parse loads as `null`, the scene comes up empty, and
## a child sees a blank screen where the film should be. Nothing else in the
## suite compiles this script -- `ResourceLoader.exists` on the .tscn does not --
## and a parse error shipped once before this assertion existed.
func test_the_player_script_compiles() -> void:
	assert_true(load("res://scripts/scenes/cinematic.gd") != null,
		"cinematic.gd parses")


func test_the_prologue_loads() -> void:
	assert_eq(String(_prologue().get("id", "")), "prologue",
		"CINEMATIC_PROLOGUE loads and knows its own id")
	assert_true(_shots().size() >= 1, "the prologue has shots")


## The check that has to run in-engine: a plate present in the working tree but
## missing from the import cache never reaches the .pck, and every static tool in
## the repo would call it fine.
func test_every_plate_is_imported() -> void:
	for shot in _shots():
		var s: Dictionary = shot
		for entry in s.get("layers", []):
			var layer: Dictionary = entry
			var path := "res://" + _opt(layer.get("src"))
			assert_true(ResourceLoader.exists(path),
				"shot '%s' plate is imported: %s" % [s.get("id", "?"), path])


## A caption that falls through renders its own key at a child. Checked in both
## locales because the film must never ship half-translated, and restored
## afterwards so the suite leaves the locale it found.
func test_every_caption_renders_in_every_locale() -> void:
	var was := TextManager.get_locale()
	for locale in ["en", "is"]:
		TextManager.set_locale(locale)
		for shot in _shots():
			var s: Dictionary = shot
			var key := _opt(s.get("caption"))
			if key == "":
				continue
			var rendered := TextManager.t(key)
			assert_true(rendered != "" and rendered != key,
				"caption '%s' renders in %s (got '%s')" % [key, locale, rendered])
	TextManager.set_locale(was)


## The camera mapping the runtime uses, checked against the data rather than
## against a screenshot: a source rect maps onto the viewport by one scale and
## one offset, so every rect must be 16:9 or the shot stretches.
func test_every_frame_is_sixteen_by_nine() -> void:
	for shot in _shots():
		var s: Dictionary = shot
		var move: Dictionary = s.get("move", {})
		for label in ["from", "to"]:
			var rect: Array = move.get(label, [])
			assert_eq(rect.size(), 4, "shot '%s' %s rect has four numbers" % [s.get("id", "?"), label])
			if rect.size() != 4:
				continue
			var ratio := float(rect[2]) / maxf(float(rect[3]), 1.0)
			assert_almost_eq(ratio, 16.0 / 9.0, 0.004,
				"shot '%s' %s rect is 16:9" % [s.get("id", "?"), label])


## A six-year-old's patience is the budget, and it is the kind of number that
## grows one shot at a time until nobody watches it.
func test_the_film_stays_under_a_minute() -> void:
	var total := 0.0
	for shot in _shots():
		var s: Dictionary = shot
		total += float(s.get("hold", 0.0)) + float(s.get("transition", CINE_FADE))
	assert_true(total <= RUNTIME_MAX_SEC,
		"the prologue runs %.1fs, at or under the %.0fs cap" % [total, RUNTIME_MAX_SEC])


## The audio in the film is all flourish (a missing SFX must never cost a fact),
## but a cue naming a key that does not exist is a typo, not a design choice.
func test_every_cue_resolves() -> void:
	var music: Dictionary = DataManager.get_dict("AUDIO_MANIFEST").get("music", {})
	var events: Dictionary = DataManager.get_dict("SOUND_EVENTS")
	for shot in _shots():
		var s: Dictionary = shot
		var track := _opt(s.get("music"))
		if track != "":
			assert_true(music.has(track), "shot '%s' music '%s' is in the manifest" % [s.get("id", "?"), track])
		var event := _opt(s.get("sfx"))
		if event != "":
			assert_true(events.has(event), "shot '%s' sfx '%s' is a known sound event" % [s.get("id", "?"), event])
