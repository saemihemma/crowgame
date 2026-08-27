extends TestCase
## Phase 0.5: data-driven registries resolve correctly — scene routing, spawn
## types, and sound events all point at things that actually exist.


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

## The progression PRODUCT.md commits to: worlds unlock strictly one at a time,
## in registry order, with the practice arena outside the chain.
##
## Pinned because the reason is the maths rather than the platforming - each
## world's mathGating steps its difficulty band upward, so a child who reaches
## the fifth world first meets subtraction before addition. A doc that states a
## rule nothing enforces is a doc that goes stale quietly.
## The card a child taps is the level it says it is.
##
## level_99 held `order: 1`, so the practice arena took the FIRST slot in level
## select and every world sat one position ahead of its own number -- the fourth
## card was level three. A playtester read that as broken unlocking: "i can play
## like level 4 now but not 3". Nothing enforced it, because `order` is only ever
## compared against itself.
##
## Pins the mapping rather than the number: world N is the Nth world card, in
## registry order, whatever `order` values are used to get there.
func test_world_card_position_matches_its_number() -> void:
	var position := 0
	for level in LevelManager.get_levels():
		var key := String(level.get("key", ""))
		if key == "level_99":
			continue
		position += 1
		var number := key.trim_prefix("level_").to_int()
		assert_eq(number, position,
			"%s is world card %d, so its number must be %d" % [key, position, position])

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


## THE GRID MAY NEVER SHOW A HOLE.
##
## A playtester photographed one: Emberskógur finished, Prismahellir ready,
## Sykurstormur LOCKED, Hverasmiðjan ready. A locked world between two open
## ones, and the locked one was a level they had already cleared.
##
## The old rule asked each level whether the single level it names as its
## requirement was in completedLevels. That is a chain, and a chain breaks in the
## middle: with level_01 and level_03 finished but not level_02, card three read
## its missing requirement and locked itself, while card four read ITS
## requirement -- the finished level_03 -- and opened.
##
## The invariant is stated as the thing a child sees, not as the arithmetic
## behind it: no card may be locked when a card after it is open.
func test_no_locked_world_sits_before_an_open_one() -> void:
	var levels: Array = LevelManager.get_levels()
	# The exact shape from the report, and three more that break a chain.
	var saves: Array = [
		[],
		["level_01"],
		["level_01", "level_03"],
		["level_03"],
		["level_01", "level_02", "level_05"],
		["level_08"],
	]
	for completed: Array in saves:
		var unlocked: Dictionary = LevelSelect.unlock_map(levels, completed)
		var seen_locked := ""
		for level: Dictionary in levels:
			var key := String(level.get("key", ""))
			if key == "level_99":
				continue
			if not bool(unlocked.get(key, false)):
				seen_locked = key
			elif seen_locked != "":
				assert_true(false,
					"with %s finished, %s is locked but the later %s is open"
						% [str(completed), seen_locked, key])
				break

## A card must never call a world locked when the child has already beaten it:
## WorldCard checks `not unlocked` before `completed`, so such a card says
## "Læst" on a world with a finished flag sitting right next to it.
func test_a_finished_world_is_never_locked() -> void:
	var levels: Array = LevelManager.get_levels()
	for completed: Array in [["level_03"], ["level_01", "level_03"], ["level_05", "level_08"]]:
		var unlocked: Dictionary = LevelSelect.unlock_map(levels, completed)
		for key: String in completed:
			assert_true(bool(unlocked.get(key, false)),
				"%s is finished but locked (save %s)" % [key, str(completed)])

## Progress in the flat practice room must not open the last platforming level.
func test_the_practice_arena_does_not_unlock_the_game() -> void:
	var levels: Array = LevelManager.get_levels()
	var unlocked: Dictionary = LevelSelect.unlock_map(levels, ["level_99"])
	assert_true(bool(unlocked.get("level_99", false)), "the arena itself is always open")
	assert_true(bool(unlocked.get("level_01", false)), "the first level needs nothing")
	assert_true(not bool(unlocked.get("level_08", false)),
		"drilling sums in a flat room opened the last level")
