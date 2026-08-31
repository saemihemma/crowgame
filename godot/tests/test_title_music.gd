extends TestCase
## The title track exists, and nothing between the title screen and the level
## touches the music transport.
##
## Two things this protects, both of which fail silently:
##
## 1. Browsers refuse to start audio before a real user gesture, so the press on
##    the title screen is the only unlock the game gets. A title screen that
##    auto-advanced would hand the player a permanently silent game and nothing
##    would error.
## 2. AudioManager is an autoload, so the track survives a scene change for free.
##    Continuity is therefore the DEFAULT, and the way to break it is for some
##    screen in between to call play_music with another key, or stop_music. Then
##    the menu goes quiet mid-bar and no test notices.
##
## WHY THIS IS A STATIC CHECK. The first version drove the real thing: it called
## Boot's audio path, asserted AudioManager reported the title key, mounted the
## menu and asserted it still did. It passed — and then the headless runner
## printed its results and never exited, because a looping MP3 had been started
## in a process with a dummy audio driver. A test that hangs the suite is worse
## than no test. What actually regresses here is not the autoload's behaviour, it
## is somebody adding a transport call to a menu, and that is a fact about the
## source rather than about a playing stream.

const TITLE_KEY := "title_music"
const SRC := "res://scripts"

## Who is allowed to move the music, and why. Everything else must leave it
## alone, which is what makes the track continuous across the boot -> login ->
## menu -> level_select chain without any of them knowing about it.
const TRANSPORT_OWNERS := {
	"boot.gd": "starts the title track on the press, which is the browser's audio unlock",
	"scenes/game.gd": "a level takes over with its own track, and stops it on the completion screen",
	"autoload/audio_manager.gd": "is the transport",
}

const TRANSPORT_CALL := "play_music|stop_music"


func test_the_title_track_is_registered_and_its_file_exists() -> void:
	var music: Dictionary = DataManager.get_dict("AUDIO_MANIFEST").get("music", {})
	assert_true(music.has(TITLE_KEY),
		"audio_manifest.json declares '%s', so the title screen has something to play" % TITLE_KEY)
	var file := String((music.get(TITLE_KEY, {}) as Dictionary).get("file", ""))
	assert_true(file != "", "'%s' names a file" % TITLE_KEY)
	assert_true(ResourceLoader.exists("res://%s" % file),
		"'%s' points at a file that is actually there: %s" % [TITLE_KEY, file])
	# Its own file, not a world's. The owner swaps this one without touching the
	# music a level plays, which is the whole reason it is a separate key.
	for key in music:
		# `_comment` keys are documentation inside the data file, which the repo
		# uses widely; this loop predated the music section having one and cast
		# the string straight to a Dictionary.
		if String(key).begins_with("_") or String(key) == TITLE_KEY:
			continue
		assert_true(String((music[key] as Dictionary).get("file", "")) != file,
			"'%s' has its own file so it can be replaced on its own; it currently shares one with '%s'"
				% [TITLE_KEY, String(key)])


func test_boot_starts_the_title_track() -> void:
	var source := _read("res://scripts/boot.gd")
	assert_true(source != "", "boot.gd is readable")
	assert_true(source.contains("play_music(TITLE_MUSIC)"),
		"the title screen starts the music itself; it is the only user gesture the browser gives it")
	assert_true(source.contains('const TITLE_MUSIC := "%s"' % TITLE_KEY),
		"boot.gd names the manifest key rather than a file path")


## The invariant: exactly the declared owners move the transport.
func test_no_screen_between_the_title_and_a_level_touches_the_music() -> void:
	var offenders: Array[String] = []
	var checked := 0
	for path in _gd_files(SRC):
		var relative := path.substr(SRC.length() + 1)
		if TRANSPORT_OWNERS.has(relative):
			continue
		var source := _strip_comments(_read(path))
		checked += 1
		for call in TRANSPORT_CALL.split("|"):
			if source.contains("%s(" % call):
				offenders.append("%s calls %s()" % [relative, call])
	assert_true(checked > 20, "the scan reached the source tree (%d files)" % checked)
	assert_true(offenders.is_empty(),
		("the title track has to survive every screen between the press and a level, and "
		+ "AudioManager outlives them all so it does that for free. These moved it: %s. "
		+ "If one of them genuinely should, add it to TRANSPORT_OWNERS with the reason.")
			% str(offenders))


## And every declared owner still exists and still does move it, so the list
## cannot quietly become an exemption for files that stopped needing one.
func test_every_declared_transport_owner_still_moves_it() -> void:
	for relative in TRANSPORT_OWNERS:
		var source := _strip_comments(_read("%s/%s" % [SRC, relative]))
		assert_true(source != "", "TRANSPORT_OWNERS names %s, which exists" % relative)
		var moves := source.contains("play_music(") or source.contains("stop_music(")
		assert_true(moves,
			"%s is exempted from the music rule but no longer touches the transport; drop it from TRANSPORT_OWNERS"
				% relative)


func _read(path: String) -> String:
	var file := FileAccess.open(path, FileAccess.READ)
	return file.get_as_text() if file != null else ""


## Comments do not call anything, and several files discuss the transport in
## prose — audio_manager.gd's own docstring names both verbs.
func _strip_comments(source: String) -> String:
	var out := ""
	for line in source.split("\n"):
		var trimmed := (line as String).strip_edges()
		if trimmed.begins_with("#"):
			continue
		out += line + "\n"
	return out


func _gd_files(root: String) -> Array[String]:
	var found: Array[String] = []
	var dir := DirAccess.open(root)
	if dir == null:
		return found
	dir.list_dir_begin()
	var name := dir.get_next()
	while name != "":
		var path := "%s/%s" % [root, name]
		if dir.current_is_dir():
			found.append_array(_gd_files(path))
		elif name.ends_with(".gd"):
			found.append(path)
		name = dir.get_next()
	dir.list_dir_end()
	return found
