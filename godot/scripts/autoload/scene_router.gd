extends Node
## SceneRouter — single place that maps logical scene names to scene files
## (data/registries/scenes.json) and performs transitions. Call
## SceneRouter.goto("main_menu"); never scatter res:// scene paths in scripts.

func path_of(name: String) -> String:
	return String(DataManager.get_dict("SCENES").get(name, ""))

func goto(name: String) -> void:
	var path := path_of(name)
	if path == "":
		push_error("[SceneRouter] unknown scene name: %s" % name)
		return
	get_tree().change_scene_to_file(path)

func has_scene(name: String) -> bool:
	return DataManager.get_dict("SCENES").has(name)
