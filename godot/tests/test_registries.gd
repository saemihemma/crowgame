extends TestCase
## Phase 0.5: data-driven registries resolve correctly — scene routing, spawn
## types, and sound events all point at things that actually exist.

func _reset() -> void:
	_failures.clear()
	_assertions = 0

func _root() -> Node:
	return Engine.get_main_loop().root

func test_scene_router_resolves_all() -> void:
	var router: Node = _root().get_node("SceneRouter")
	for name in ["boot", "login", "main_menu", "level_select", "game"]:
		assert_true(router.has_scene(name), "scene '%s' registered" % name)
		assert_true(ResourceLoader.exists(router.path_of(name)), "scene '%s' file exists" % name)

func test_spawn_registry_scenes_exist() -> void:
	var dm: Node = _root().get_node("DataManager")
	var reg: Dictionary = dm.get_dict("SPAWN_REGISTRY")
	for type in ["collectible", "hazard", "door", "npc", "enemy"]:
		assert_true(reg.has(type), "spawn type '%s' registered" % type)
		assert_true(ResourceLoader.exists(String(reg[type]["scene"])), "scene for '%s' exists" % type)

func test_sound_events_map_to_manifest() -> void:
	var dm: Node = _root().get_node("DataManager")
	var events: Dictionary = dm.get_dict("SOUND_EVENTS")
	var sfx: Dictionary = dm.get_dict("AUDIO_MANIFEST").get("sfx", {})
	assert_true(events.size() >= 10, "sound events defined")
	for ev in events:
		if ev.begins_with("_"):
			continue
		assert_true(sfx.has(String(events[ev])), "event '%s' -> sfx key '%s' exists" % [ev, events[ev]])

## The progression PROJECT.md commits to: worlds unlock strictly one at a time,
## in registry order, with the practice arena outside the chain.
##
## Pinned because the reason is the maths rather than the platforming - each
## world's mathGating steps its difficulty band upward, so a child who reaches
## the fifth world first meets subtraction before addition. A doc that states a
## rule nothing enforces is a doc that goes stale quietly.
func test_worlds_unlock_one_at_a_time() -> void:
	var levels: Array = LevelManager.get_levels()
	var worlds: Array = []
	for level in levels:
		var key := String(level.get("key", ""))
		if key == "level_99":
			# The practice arena is always open on purpose: it is where a child
			# drills, not where they progress.
			assert_true(level.get("unlockRequirement", null) == null,
				"the practice arena is never locked")
			continue
		worlds.append(level)

	assert_true(worlds.size() >= 5, "the five worlds are registered")
	for i in worlds.size():
		var key := String(worlds[i].get("key", ""))
		var req = worlds[i].get("unlockRequirement", null)
		if i == 0:
			assert_true(req == null, "%s opens a fresh save" % key)
			continue
		assert_true(req != null, "%s is locked behind something" % key)
		if req == null:
			continue
		var previous := String(worlds[i - 1].get("key", ""))
		assert_eq(String(req.get("level", "")), previous,
			"%s unlocks from the world immediately before it" % key)

## Each world teaches at least as hard as the one before it, which is what makes
## the strict order worth enforcing.
func test_difficulty_bands_never_step_backwards() -> void:
	var highest := 0.0
	for level in LevelManager.get_levels():
		if String(level.get("key", "")) == "level_99":
			continue
		var gating: Dictionary = level.get("mathGating", {})
		var band: Array = gating.get("difficultyBand", [])
		assert_true(band.size() == 2, "%s declares a difficulty band" % level.get("key", "?"))
		if band.size() != 2:
			continue
		assert_true(float(band[1]) >= highest,
			"%s tops out at %s, below the %s a previous world already asked for"
				% [level.get("key", "?"), str(band[1]), str(highest)])
		highest = maxf(highest, float(band[1]))
