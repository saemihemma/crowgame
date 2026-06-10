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
