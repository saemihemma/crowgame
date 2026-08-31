extends TestCase
## The audio MIX, as facts rather than as taste.
##
## check_hardcoding.py already proves the wiring resolves in every direction: a
## moment fired is a moment registered, a moment registered is a moment fired,
## and every moment has a row in brand/SOUND_DESIGN.md. None of that says
## anything about whether the result is a design or a pile.
##
## This pins the parts of the design that ARE checkable, and only those. What a
## sound is like is a listening job (that is what /audio is for); what tier it
## sits at, whether it can be heard, and whether a world has a place-sound at all
## are facts in data, and every one of them has a failure mode that is silent.


func _manifest() -> Dictionary:
	return DataManager.get_dict("AUDIO_MANIFEST")


func _sfx() -> Dictionary:
	return _manifest().get("sfx", {})


func _defs() -> Array:
	var out: Array = []
	for key in _sfx():
		if not String(key).begins_with("_"):
			out.append([String(key), _sfx()[key]])
	return out


# --- 1. the ladder ----------------------------------------------------------

## The reward ladder is strictly ordered, and it is the design.
##
## brand/SOUND_DESIGN.md §3: each tier is louder than the one below it, so a big
## coin cannot be mistaken for a coin at the moment a six-year-old hears it. The
## file peaks carry the coarse ordering (tools/gen_sfx.py asserts those); this is
## the manifest half, where a well-meant tweak to one `volume` can quietly invert
## a rank without touching a single sound.
const LOUDER_THAN := [
	["coin_collect", "button"],
	["correct", "coin_collect"],
	["big_coin", "coin_collect"],
	["big_coin_all", "big_coin"],
	["level_complete", "big_coin_all"],
	["comeback", "milestone"],
	["button", "button_focus"],
	["button_focus", "ui_hover"],
]


func test_the_reward_ladder_is_in_order() -> void:
	for pair in LOUDER_THAN:
		var louder := float((_sfx().get(pair[0], {}) as Dictionary).get("volume", 0.0))
		var quieter := float((_sfx().get(pair[1], {}) as Dictionary).get("volume", 0.0))
		assert_true(louder > quieter,
			"'%s' (%.2f) must be louder than '%s' (%.2f) -- the ladder is the design"
				% [pair[0], louder, pair[1], quieter])


## A miss is never punished, and the rail is a number: the wrong-answer cue is
## quieter than the coin. PRODUCT.md's design commitment, in the only form that
## can fail a build.
func test_a_wrong_answer_is_quieter_than_a_coin() -> void:
	var wrong := float((_sfx().get("wrong", {}) as Dictionary).get("volume", 1.0))
	var coin := float((_sfx().get("coin_collect", {}) as Dictionary).get("volume", 0.0))
	assert_true(wrong < coin,
		"'wrong' (%.2f) has to stay under 'coin_collect' (%.2f): a seven-year-old hears it often"
			% [wrong, coin])


# --- 2. the world ------------------------------------------------------------

## Every world names an ambience bed, and every bed it names exists.
##
## Silent by construction otherwise: AudioManager.play_bed returns on a stream it
## cannot load, so a theme with a typo in its `ambience` just stops having a
## place-sound, in one world, on one level, with no error anywhere.
func test_every_world_has_a_bed_that_exists() -> void:
	var beds: Dictionary = _manifest().get("beds", {})
	var seen := 0
	# Read through ThemeManager's own key list rather than a copy of it, so a
	# sixth world added tomorrow is checked without this test being touched.
	for data_key in ThemeManager.THEME_KEYS:
		var theme: Dictionary = DataManager.get_dict(String(data_key))
		var id := String(theme.get("id", data_key))
		var key := String(theme.get("ambience", ""))
		assert_true(key != "", "theme '%s' names an ambience bed" % id)
		assert_true(beds.has(key), "theme '%s' names bed '%s', which the manifest has" % [id, key])
		var file := String((beds.get(key, {}) as Dictionary).get("file", ""))
		assert_true(file != "" and ResourceLoader.exists("res://%s" % file),
			"bed '%s' points at a file that is there: %s" % [key, file])
		seen += 1
	assert_true(seen >= 5, "the scan reached the themes (%d)" % seen)


## The proximity layer is fairness: a sound emitted in the world has to be able
## to reach the player from far enough away to be a warning rather than a
## surprise. The one that matters most is the cockroach.
const CARRIES_AT_LEAST := {
	"roach_skitter": 380.0,
	"enemy_charge": 500.0,
	"big_coin_shimmer": 250.0,
}


func test_the_warnings_carry_far_enough_to_be_warnings() -> void:
	for key in CARRIES_AT_LEAST:
		var def: Dictionary = _sfx().get(key, {})
		assert_true(not def.is_empty(), "'%s' is in the manifest" % key)
		var reach := float(def.get("max_distance", 0.0))
		assert_true(reach >= float(CARRIES_AT_LEAST[key]),
			"'%s' carries %.0fpx; it needs at least %.0f to arrive before the thing it warns about"
				% [key, reach, float(CARRIES_AT_LEAST[key])])


## And the beetle's wind-up carries FURTHER than its spit, which is the whole
## point of a telegraph.
func test_the_telegraph_outreaches_the_attack() -> void:
	var charge := float((_sfx().get("enemy_charge", {}) as Dictionary).get("max_distance", 0.0))
	var spit := float((_sfx().get("enemy_spit", {}) as Dictionary).get("max_distance", 0.0))
	assert_true(charge > spit,
		"the wind-up (%.0fpx) has to reach further than the spit (%.0fpx)" % [charge, spit])


# --- 3. the runs -------------------------------------------------------------

## A pitch ladder that is not a run is a sound that jumps to a random note.
##
## AudioManager walks these in order, so they must ASCEND, and they must stay in
## the pentatonic set brand/SOUND_DESIGN.md §2 commits to -- a ladder with a
## semitone in it is the one way a cue can land sour against a music bed nobody
## has written yet.
const PENTATONIC_SEMITONES := [0, 2, 4, 5, 7, 9, 12, 14, 16, 17, 19, 21, 24]


func test_every_pitch_ladder_climbs_and_stays_in_the_scale() -> void:
	var ladders := 0
	for entry in _defs():
		var def: Dictionary = entry[1]
		var ladder: Array = def.get("pitch_ladder", [])
		if ladder.is_empty():
			continue
		ladders += 1
		var previous := -999
		for step in ladder:
			assert_true(int(step) > previous,
				"'%s' pitch_ladder must ascend; %d follows %d" % [entry[0], int(step), previous])
			previous = int(step)
			assert_true(PENTATONIC_SEMITONES.has(int(step)),
				"'%s' pitch_ladder step %d is outside C major pentatonic" % [entry[0], int(step)])
	assert_true(ladders >= 2, "the coin run and the answer streak both have ladders (%d)" % ladders)


# --- 4. the shape of the mix -------------------------------------------------

## Every sound is reachable and sanely levelled. A `volume` of 0 is a registered
## moment that plays nothing, which is exactly the failure the whole two-hop
## registry exists to make impossible.
func test_no_moment_is_registered_at_silence() -> void:
	var checked := 0
	for entry in _defs():
		var def: Dictionary = entry[1]
		var volume := float(def.get("volume", 1.0))
		assert_true(volume > 0.0 and volume <= 1.0,
			"'%s' volume %.3f is outside (0, 1]" % [entry[0], volume])
		assert_true(String(def.get("file", "")) != "", "'%s' names a file" % entry[0])
		checked += 1
	assert_true(checked >= 40, "the scan reached the manifest (%d keys)" % checked)


## The mix block exists and carries the numbers AudioManager reads. Its fallbacks
## are deliberate, but a mix that has silently fallen back to them is a mix
## nobody can tune from data any more.
func test_the_mix_block_is_present() -> void:
	var mix: Dictionary = _manifest().get("mix", {})
	for key in ["max_voices", "default_pool", "duck_db", "duck_in_ms", "duck_out_ms"]:
		assert_true(mix.has(key), "mix declares '%s'" % key)
	assert_true(float(mix.get("duck_db", 0.0)) < 0.0,
		"a duck goes DOWN; duck_db is %.1f" % float(mix.get("duck_db", 0.0)))
	assert_true(float(mix.get("duck_out_ms", 0.0)) > float(mix.get("duck_in_ms", 0.0)),
		"the music comes back slower than it ducks, or the return is heard as an event")
