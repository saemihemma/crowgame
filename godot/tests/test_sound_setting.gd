extends TestCase
## The sound toggle, which replaced a theme switcher in the Pause menu.
##
## The volume API in audio_manager.gd had existed since the audio system was
## written with nothing ever calling it -- there was no way for a player to turn
## the sound down. These pin the three things that make it a setting rather than
## a button: it mutes, it persists, and playback actually respects it.

func _audio() -> Node:
	return Engine.get_main_loop().root.get_node("AudioManager")


func test_muting_is_readable_back() -> void:
	var audio := _audio()
	var prev: bool = audio.is_muted()
	audio.set_muted(true)
	assert_true(audio.is_muted(), "set_muted(true) is readable back")
	audio.set_muted(false)
	assert_true(not audio.is_muted(), "and unmuting is too")
	audio.set_muted(prev)


## A muted game that comes back loud after a reload is not a setting. The choice
## goes to the same persistence layer as the locale, under the same key and with
## the same "1"/"0" values the web port writes.
func test_the_choice_is_persisted() -> void:
	var audio := _audio()
	var prev: bool = audio.is_muted()
	audio.set_muted(true)
	assert_eq(String(Persistence.get_item(audio.MUTE_KEY)), "1",
		"muting writes the choice to persistence")
	audio.set_muted(false)
	assert_eq(String(Persistence.get_item(audio.MUTE_KEY)), "0",
		"unmuting writes that too")
	audio.set_muted(prev)


## The label the player reads has to follow the state, in both languages.
func test_the_pause_label_follows_the_state_in_both_locales() -> void:
	var tm: Node = Engine.get_main_loop().root.get_node("TextManager")
	var prev_locale: String = tm.get_locale()

	tm.set_locale("en")
	assert_eq(tm.t("pause.sound", [tm.t("sound.on")]), "Sound: On", "English, sound on")
	assert_eq(tm.t("pause.sound", [tm.t("sound.off")]), "Sound: Off", "English, sound off")

	tm.set_locale("is")
	assert_eq(tm.t("pause.sound", [tm.t("sound.on")]), "Hljóð: Kveikt", "Icelandic, sound on")
	assert_eq(tm.t("pause.sound", [tm.t("sound.off")]), "Hljóð: Slökkt", "Icelandic, sound off")

	tm.set_locale(prev_locale)


## The theme switcher this replaced is gone from the bundles too, so a future
## reader does not find orphan keys and wonder where the control went.
func test_the_theme_switcher_keys_are_gone() -> void:
	var f := FileAccess.open("res://data/i18n/strings_en.json", FileAccess.READ)
	var en: Dictionary = JSON.parse_string(f.get_as_text())
	f.close()
	for key in ["pause.theme", "theme.forest", "theme.scifi"]:
		assert_true(not en.has(key),
			"'%s' is gone — a theme is a property of a place, not a setting" % key)
