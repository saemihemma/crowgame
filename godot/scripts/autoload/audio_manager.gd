extends Node
## AudioManager — the whole of what the game hears.
##
## Three transports, and keeping them apart is most of the design:
##
##   MUSIC     one track, owned by boot.gd and game.gd, survives every scene
##             change because this is an autoload. Ducks under the maths board.
##   BED       one non-positional ambience loop per WORLD (wind, drips, steam).
##             Named by the theme, not by the level, so two levels in the same
##             biome sound like the same place.
##   VOICES    everything else. One-shots and positional loops, pooled, pitched
##             and distance-mixed.
##
## Nothing in `.gd` has ever heard of a `.wav`, and that stays true: a call site
## names a MOMENT ("coin"), data/audio/sound_events.json maps the moment to a
## key, and data/audio/audio_manifest.json maps the key to a file plus its mix.
## godot/tools/check_hardcoding.py enforces both directions, so a moment cannot
## be registered and never fire, and a moment cannot fire and find nothing.
##
## brand/SOUND_DESIGN.md is the design this implements; where the two disagree,
## this file wins and the doc is the bug.

# ── The mix ─────────────────────────────────────────────────────────────────
# Every number here comes from audio_manifest.json's `mix` block, because the
# mix is exactly the kind of thing that gets tuned by ear against the real files
# and must not need a code change to move.
var _manifest: Dictionary = {}
var _mix: Dictionary = {}

var _master_volume := 1.0
var _muted := false

# ── Transports ──────────────────────────────────────────────────────────────
var _music_player: AudioStreamPlayer
var _current_music_key := ""
## Ducking is an OFFSET rather than a second volume, so a duck that lands while
## the player is changing the volume cannot fight it: both feed one calculation.
var _duck_db := 0.0
var _ducked := false
var _duck_tween: Tween

var _bed_player: AudioStreamPlayer
var _bed_key := ""

## Positional loops, kept so mute and the volume rows can re-level what is
## already emitting. Entities own the nodes; this holds weak-ish references and
## prunes freed ones on every pass.
var _loops: Array[AudioStreamPlayer2D] = []

## Active one-shots per manifest key, for `pool` (how many of THIS sound may
## overlap) and `mix.max_voices` (how many of anything may).
var _voices: Dictionary = {}

## Last time each key started, for `min_interval_ms` — the anti-machine-gun.
var _last_started: Dictionary = {}

## Where each key currently sits on its `pitch_ladder`, and when that run
## expires. This is the coin run: pick coins up quickly and they climb.
var _ladder_step: Dictionary = {}
var _ladder_until: Dictionary = {}


func _ready() -> void:
	# Sound keeps working while the tree is paused: the pause menu's own rows
	# make sounds, the music has to duck under it, and a tween that freezes
	# mid-duck leaves the track quiet for as long as the child stays in the menu.
	process_mode = Node.PROCESS_MODE_ALWAYS
	_music_player = AudioStreamPlayer.new()
	_music_player.bus = "Master"
	add_child(_music_player)
	_bed_player = AudioStreamPlayer.new()
	_bed_player.bus = "Master"
	add_child(_bed_player)
	_load_mute_preference()
	init(DataManager.get_dict("AUDIO_MANIFEST"))

func init(manifest: Dictionary) -> void:
	_manifest = manifest
	_mix = manifest.get("mix", {}) if manifest.get("mix", null) is Dictionary else {}


# ── Moments ─────────────────────────────────────────────────────────────────

## Play a gameplay EVENT, decoupled from the asset.
##
## `opts` is for the two things a call site legitimately knows that data cannot:
##   pitch_step  how far up this sound's `pitch_ladder` to sit (the streak).
##   volume      a linear multiplier on top of the manifest's, 0..1.
func play_event(event: String, opts: Dictionary = {}) -> void:
	play_sfx(_key_for(event), opts)

## Play a manifest KEY directly. Only audio_manager.gd may call this, and
## godot/tools/check_hardcoding.py enforces it: a sound played by key from a
## game script is a sound nobody can re-assign without touching code.
func play_sfx(key: String, opts: Dictionary = {}) -> void:
	_one_shot(key, null, opts)

## The same moment, emitted from a place in the world.
##
## Distance and pan come from Godot's own 2D audio against the level camera, so
## a cockroach dying off to the left is quieter and to the left. The player is
## parented to the emitter's PARENT, not the emitter: half the things that make
## a sound (an enemy, a chain link, a projectile) free themselves in the same
## frame, and a sound parented to them is cut off mid-syllable.
func play_event_at(event: String, node: Node2D, opts: Dictionary = {}) -> void:
	if not is_instance_valid(node):
		return
	_one_shot(_key_for(event), node, opts)

## Start a positional LOOP that lives as long as the node does.
##
## This is the proximity layer: a cockroach skittering, a puddle bubbling, a
## door humming. Returns the player so a caller that needs to stop it early
## (a puddle that dries, a big coin that turns out to be banked) can.
func attach_loop(event: String, node: Node2D) -> AudioStreamPlayer2D:
	var key := _key_for(event)
	if key == "" or not is_instance_valid(node):
		return null
	var def: Dictionary = _sfx_def(key)
	var stream := _looping(_load_stream(String(def.get("file", ""))))
	if stream == null:
		return null
	var p := AudioStreamPlayer2D.new()
	p.stream = stream
	p.max_distance = float(def.get("max_distance", _mix_num("default_max_distance", 400.0)))
	p.attenuation = float(def.get("attenuation", _mix_num("default_attenuation", 1.6)))
	p.volume_db = linear_to_db(_ambience_gain(float(def.get("volume", 1.0))))
	p.set_meta("crow_volume", float(def.get("volume", 1.0)))
	node.add_child(p)
	if not _muted:
		p.play()
	_loops.append(p)
	return p

## Stop and free one loop early. Safe to call twice, or on null.
func detach_loop(player: AudioStreamPlayer2D) -> void:
	if not is_instance_valid(player):
		return
	_loops.erase(player)
	player.stop()
	player.queue_free()


# ── Music ───────────────────────────────────────────────────────────────────

func play_music(key: String, _crossfade_ms: float = 500.0) -> void:
	if key == _current_music_key and _music_player.playing:
		return
	var def: Dictionary = _manifest.get("music", {}).get(key, {})
	var stream := _load_stream(String(def.get("file", "")))
	if stream == null:
		return
	if stream is AudioStreamMP3:
		(stream as AudioStreamMP3).loop = bool(def.get("loop", true))
	_music_player.stream = stream
	_current_music_key = key
	_apply_music_volume()
	if not _muted:
		_music_player.play()

## Which track is playing, or "" for silence.
##
## Exposed because "the title music keeps playing into the menu" is an invariant
## a test has to be able to state. AudioManager outlives every scene, so
## continuity is the DEFAULT -- and that is exactly the kind of thing that breaks
## silently the first time someone adds a play_music call to a menu.
func current_music_key() -> String:
	return _current_music_key if is_instance_valid(_music_player) and _music_player.playing else ""


func stop_music(_fade_ms: float = 500.0) -> void:
	_music_player.stop()
	_current_music_key = ""

## Pull the music down so something else can be heard over it, and let it back.
##
## The maths board is a room the child steps into: the level's track drops by
## `mix.duck_db` while a board or a lesson is open and comes back when it
## closes. A duck is a level change, never a stop -- a track that stops and
## restarts loses its place, and a six-year-old answering three questions in a
## row would hear the first bar four times.
func duck_music(ducked: bool) -> void:
	if ducked == _ducked:
		return
	_ducked = ducked
	var target: float = _mix_num("duck_db", -6.0) if ducked else 0.0
	var ms: float = _mix_num("duck_in_ms", 120.0) if ducked else _mix_num("duck_out_ms", 400.0)
	if _duck_tween != null and _duck_tween.is_valid():
		_duck_tween.kill()
	_duck_tween = create_tween()
	_duck_tween.tween_method(_set_duck_db, _duck_db, target, ms / 1000.0)

func _set_duck_db(db: float) -> void:
	_duck_db = db
	_apply_music_volume()


# ── The ambience bed ────────────────────────────────────────────────────────

## Start the world's ambience bed, named by a key in the manifest's `beds`.
##
## A key rather than an event on purpose, and for the same reason music is a
## key: which bed plays is a property of the PLACE, so it is named in
## data/themes/theme_<world>.json beside that world's palette, and a level
## inherits it from its theme. Two levels in one biome then sound like one
## biome without either of them saying so.
func play_bed(key: String) -> void:
	if key == _bed_key and _bed_player.playing:
		return
	if key == "":
		stop_bed()
		return
	var def: Dictionary = _manifest.get("beds", {}).get(key, {})
	var stream := _looping(_load_stream(String(def.get("file", ""))))
	if stream == null:
		stop_bed()
		return
	_bed_player.stream = stream
	_bed_key = key
	_bed_player.volume_db = linear_to_db(_ambience_gain(float(def.get("volume", 1.0))))
	if not _muted:
		_bed_player.play()

func stop_bed() -> void:
	if is_instance_valid(_bed_player):
		_bed_player.stop()
	_bed_key = ""

func current_bed_key() -> String:
	return _bed_key if is_instance_valid(_bed_player) and _bed_player.playing else ""


# ── Playing one sound ───────────────────────────────────────────────────────

func _key_for(event: String) -> String:
	return String(DataManager.get_dict("SOUND_EVENTS").get(event, ""))

func _sfx_def(key: String) -> Dictionary:
	var def: Variant = _manifest.get("sfx", {}).get(key, {})
	return def if def is Dictionary else {}

func _one_shot(key: String, at: Node2D, opts: Dictionary) -> void:
	if _muted or key == "":
		return
	var def := _sfx_def(key)
	var stream := _load_stream(String(def.get("file", "")))
	if stream == null:
		return
	if not _may_start(key, def):
		return

	var pitch := _pitch_for(key, def, opts)
	var gain := _sfx_gain(float(def.get("volume", 1.0)) * float(opts.get("volume", 1.0)))

	if at != null:
		var p2 := AudioStreamPlayer2D.new()
		p2.stream = stream
		p2.max_distance = float(def.get("max_distance", _mix_num("default_max_distance", 400.0)))
		p2.attenuation = float(def.get("attenuation", _mix_num("default_attenuation", 1.6)))
		p2.volume_db = linear_to_db(gain)
		p2.pitch_scale = pitch
		_host_for(at).add_child(p2)
		p2.global_position = at.global_position
		_remember(key, p2)
		p2.finished.connect(func() -> void:
			_forget(key, p2)
			p2.queue_free())
		p2.play()
		return

	var p1 := AudioStreamPlayer.new()
	p1.bus = "Master"
	p1.stream = stream
	p1.volume_db = linear_to_db(gain)
	p1.pitch_scale = pitch
	add_child(p1)
	_remember(key, p1)
	p1.finished.connect(func() -> void:
		_forget(key, p1)
		p1.queue_free())
	p1.play()

## Where a positional one-shot lives.
##
## The emitter's parent, so the sound outlives an entity that frees itself in
## the same frame -- which is most of them: an enemy bursting, a chain link
## popping, a projectile landing. Falls back to the emitter when it has no 2D
## parent to hand the sound to.
func _host_for(node: Node2D) -> Node:
	var parent := node.get_parent()
	return parent if parent is Node2D else node


# ── Pooling, pitch and the anti-machine-gun ─────────────────────────────────

## May this key start another voice right now?
##
## Two gates, and both exist because a child holds buttons down.
##
## `min_interval_ms` is a floor between two of the SAME sound. A footstep at 8 Hz
## is a run; at 40 Hz it is a buzz, and the difference is one frame of a stuck
## input. `pool` is how many may overlap once they have started: past it the
## OLDEST is stopped rather than the new one dropped, because the new one is the
## one the child just caused.
func _may_start(key: String, def: Dictionary) -> bool:
	var now := Time.get_ticks_msec()
	var floor_ms := int(def.get("min_interval_ms", 0))
	if floor_ms > 0 and now - int(_last_started.get(key, -floor_ms * 2)) < floor_ms:
		return false
	_last_started[key] = now

	_prune()
	var here: Array = _voices.get(key, [])
	var pool := int(def.get("pool", int(_mix_num("default_pool", 4.0))))
	while here.size() >= maxi(1, pool):
		_stop_oldest(here)
	var total := 0
	for k in _voices:
		total += (_voices[k] as Array).size()
	var cap := int(_mix_num("max_voices", 12.0))
	while total >= cap:
		var longest: Array = []
		for k in _voices:
			if (_voices[k] as Array).size() > longest.size():
				longest = _voices[k]
		if longest.is_empty():
			break
		_stop_oldest(longest)
		total -= 1
	return true

func _stop_oldest(list: Array) -> void:
	var oldest: Variant = list.pop_front()
	if is_instance_valid(oldest):
		oldest.stop()
		oldest.queue_free()

func _remember(key: String, p: Node) -> void:
	if not _voices.has(key):
		_voices[key] = []
	(_voices[key] as Array).append(p)

func _forget(key: String, p: Node) -> void:
	if _voices.has(key):
		(_voices[key] as Array).erase(p)

func _prune() -> void:
	for key in _voices:
		var list: Array = _voices[key]
		for i in range(list.size() - 1, -1, -1):
			if not is_instance_valid(list[i]):
				list.remove_at(i)

## The pitch this voice plays at.
##
## Three things stack, in this order:
##
##  1. `pitch_ladder` -- a run. Semitone offsets a sound climbs while it keeps
##     firing inside `ladder_window_ms`, then falls back to the bottom. Coins do
##     this, and it is the single cheapest piece of delight in the game: five
##     coins in a row is a rising phrase rather than five identical dings.
##  2. `opts.pitch_step` -- a step the CALLER knows about, for a run the sound
##     itself cannot see. The answer streak is this: three right answers in a row
##     climb, and a wrong answer holds the step rather than resetting it, which
##     is the same rule the visible streak follows.
##  3. `pitch_jitter` -- a few cents either way so a sound that fires constantly
##     (footsteps, a skitter tick) never repeats itself exactly.
func _pitch_for(key: String, def: Dictionary, opts: Dictionary) -> float:
	var ladder: Array = def.get("pitch_ladder", [])
	var semitones := 0.0
	if opts.has("pitch_step"):
		# The CALLER owns the run, so the sound's own timer must not also move it.
		var want := int(opts["pitch_step"])
		semitones = float(ladder[clampi(want, 0, ladder.size() - 1)]) if not ladder.is_empty() \
			else float(want)
	elif not ladder.is_empty():
		var now := Time.get_ticks_msec()
		var step := 0
		if now < int(_ladder_until.get(key, 0)):
			step = mini(int(_ladder_step.get(key, 0)) + 1, ladder.size() - 1)
		_ladder_step[key] = step
		_ladder_until[key] = now + int(def.get("ladder_window_ms", 1200))
		semitones = float(ladder[step])
	var jitter := float(def.get("pitch_jitter", 0.0))
	if jitter > 0.0:
		semitones += randf_range(-jitter, jitter)
	return pow(2.0, semitones / 12.0)


# ── Volume, mute and the rows in the pause menu ─────────────────────────────

const MUTE_KEY := "crow_sound_muted"
const VOLUME_KEY := "crow_master_volume"


## Mute or unmute everything, and remember the choice.
##
## A game a child plays in a car, a waiting room or a classroom needs one, and it
## has to survive a reload, so the choice is persisted beside crow_locale.
##
## Mute STOPS the loops rather than silencing them: a muted tablet should not be
## decoding six ambience streams. Unmuting starts them again from the registry,
## which is why that registry exists -- before it, muting and unmuting mid-level
## left the world silent until the next level load, and nothing said so.
func set_muted(muted: bool) -> void:
	_muted = muted
	# "1"/"0" rather than a bool: Persistence mirrors localStorage and stores
	# strings, and the web port writes the same two values under the same key.
	Persistence.set_item(MUTE_KEY, "1" if muted else "0")
	if muted:
		if is_instance_valid(_music_player):
			_music_player.stop()
		if is_instance_valid(_bed_player):
			_bed_player.stop()
		for p in _loops:
			if is_instance_valid(p):
				p.stop()
		return
	if is_instance_valid(_music_player) and _music_player.stream != null:
		_music_player.play()
	if is_instance_valid(_bed_player) and _bed_player.stream != null:
		_bed_player.play()
	for p in _loops:
		if is_instance_valid(p):
			p.play()


func is_muted() -> bool:
	return _muted


## Restore the stored choice. Called from _ready so nothing can play before it.
func _load_mute_preference() -> void:
	# str(), not String(): get_item mirrors localStorage and returns null when the
	# key was never written, and String(null) is a runtime error -- so it fired on
	# exactly the boot that has no stored choice to read, a fresh install.
	_muted = str(Persistence.get_item(MUTE_KEY)) == "1"
	var stored := str(Persistence.get_item(VOLUME_KEY))
	if stored != "" and stored != "<null>" and stored.is_valid_float():
		_master_volume = clampf(stored.to_float(), 0.0, 1.0)


## Master volume, remembered and applied at once — to everything already
## emitting, not just to the next sound.
func set_master_volume(v: float) -> void:
	_master_volume = clampf(v, 0.0, 1.0)
	Persistence.set_item(VOLUME_KEY, str(_master_volume))
	_apply_music_volume()
	_apply_ambience_volume()

func get_master_volume() -> float: return _master_volume

## Re-level whatever is already playing. Without this a volume change is
## inaudible until the next level loads.
func _apply_music_volume() -> void:
	if not is_instance_valid(_music_player) or _current_music_key == "":
		return
	var def: Dictionary = _manifest.get("music", {}).get(_current_music_key, {})
	var gain := _resolve_volume(float(def.get("volume", 1.0)), _mix_num("music_volume", 1.0))
	_music_player.volume_db = linear_to_db(gain) + _duck_db

func _apply_ambience_volume() -> void:
	if is_instance_valid(_bed_player) and _bed_key != "":
		var def: Dictionary = _manifest.get("beds", {}).get(_bed_key, {})
		_bed_player.volume_db = linear_to_db(_ambience_gain(float(def.get("volume", 1.0))))
	for i in range(_loops.size() - 1, -1, -1):
		var p: AudioStreamPlayer2D = _loops[i]
		if not is_instance_valid(p):
			_loops.remove_at(i)
			continue
		p.volume_db = linear_to_db(_ambience_gain(float(p.get_meta("crow_volume", 1.0))))

func _sfx_gain(track_volume: float) -> float:
	return _resolve_volume(track_volume, _mix_num("sfx_volume", 1.0))

func _ambience_gain(track_volume: float) -> float:
	return _resolve_volume(track_volume, _mix_num("ambience_volume", 1.0))

func _resolve_volume(track_vol: float, category_vol: float) -> float:
	return clampf(track_vol * category_vol * _master_volume, 0.0001, 1.0)

func _mix_num(key: String, fallback: float) -> float:
	return float(_mix.get(key, fallback))


# ── Streams ─────────────────────────────────────────────────────────────────

func _load_stream(file: String) -> AudioStream:
	if file == "":
		return null
	# Manifest paths are like "assets/audio/music/level_01.mp3" (relative to data root).
	var path := "res://%s" % file
	if not ResourceLoader.exists(path):
		return null
	var res := ResourceLoader.load(path)
	return res if res is AudioStream else null

## A copy of the stream that loops.
##
## A copy, because the import settings are shared: flipping loop_mode on the
## loaded resource would turn every other user of that file into a loop too, and
## the one-shot that shares it would never stop.
func _looping(stream: AudioStream) -> AudioStream:
	if stream == null:
		return null
	if stream is AudioStreamWAV:
		var w := (stream as AudioStreamWAV).duplicate() as AudioStreamWAV
		if w.loop_mode == AudioStreamWAV.LOOP_DISABLED:
			w.loop_mode = AudioStreamWAV.LOOP_FORWARD
			w.loop_begin = 0
			var frames := _wav_frames(w)
			if frames > 0:
				w.loop_end = frames
		return w
	if stream is AudioStreamMP3:
		var m := (stream as AudioStreamMP3).duplicate() as AudioStreamMP3
		m.loop = true
		return m
	return stream

## How many frames a PCM WAV holds, so a loop can end at the end of it.
##
## Returns 0 for a compressed format, where `data` is not frames and the
## importer's own loop points are the only correct ones.
func _wav_frames(w: AudioStreamWAV) -> int:
	var bytes_per_sample := 0
	if w.format == AudioStreamWAV.FORMAT_16_BITS:
		bytes_per_sample = 2
	elif w.format == AudioStreamWAV.FORMAT_8_BITS:
		bytes_per_sample = 1
	if bytes_per_sample == 0:
		return 0
	var channels := 2 if w.stereo else 1
	return w.data.size() / (bytes_per_sample * channels)
