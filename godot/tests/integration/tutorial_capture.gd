extends Node
## Renders every card of every concept lesson to a PNG, in either language.
##
## Not a test and not in any suite: this is the contact sheet a UI/UX pass works
## from. The lessons are drawn in code from `tutorial_tuning.json`, so the only
## way to see what a layout or palette change did to 120 cards is to look at
## them, and the only way to look at them without playing to each concept is
## this.
##
## Launch it through godot/tools/capture_tutorials.sh, which supplies the
## display and the output directory.

func _ready() -> void:
	await get_tree().process_frame
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var out_dir := "user://tutorial_captures"
	var locale := "en"
	var theme_id := ThemeManager.get_theme_id()
	var wanted: Array[String] = []
	for arg in args:
		if arg.begins_with("--out="):
			out_dir = arg.substr(6)
		elif arg.begins_with("--locale="):
			locale = arg.substr(9)
		elif arg.begins_with("--theme="):
			theme_id = arg.substr(8)
		else:
			wanted.append(arg)

	DirAccess.make_dir_recursive_absolute(out_dir)
	TextManager.set_locale(locale)
	if ThemeManager.has_theme(theme_id):
		ThemeManager.set_theme(theme_id)

	if wanted.is_empty():
		for tutorial: Variant in DataManager.get_dict("MATH_TUTORIALS").get("tutorials", []):
			wanted.append(String(tutorial["id"]))

	var written := 0
	for id in wanted:
		var lesson := TutorialManager.get_tutorial(id)
		if lesson.is_empty():
			printerr("no such lesson: %s" % id)
			continue
		var overlay: CanvasLayer = load("res://scenes/MathTutorial.tscn").instantiate()
		add_child(overlay)
		overlay.present(lesson)
		for card in overlay.card_count():
			# Long enough for the entrance tween to settle; a card captured
			# mid-pop is half transparent and misreads as a contrast bug.
			for i in 20:
				await get_tree().process_frame
			await RenderingServer.frame_post_draw
			var path := "%s/%s__%s__%d_%s.png" % [
				out_dir, locale, id.replace(".", "_"), card + 1, String(overlay.current_card().get("body", ""))]
			get_viewport().get_texture().get_image().save_png(path)
			written += 1
			if card < overlay.card_count() - 1:
				overlay.advance()
		overlay.queue_free()
		await get_tree().process_frame

	print("wrote %d card(s) to %s" % [written, out_dir])
	get_tree().quit(0)
