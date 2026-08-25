extends Node
## AudioManager — ported from the retired Phaser build; this is now the only implementation.
## Baseline music/SFX playback from data/audio/audio_manifest.json. Slice 8 adds
## pooling and music cross-fade; the API shape is kept so call sites are stable.

var _manifest: Dictionary = {}
var _master_volume := 1.0
var _music_volume := 1.0
var _sfx_volume := 1.0

var _music_player: AudioStreamPlayer
var _current_music_key := ""

func _ready() -> void:
	_music_player = AudioStreamPlayer.new()
	_music_player.bus = "Master"
	add_child(_music_player)
	_load_mute_preference()
	init(DataManager.get_dict("AUDIO_MANIFEST"))

func init(manifest: Dictionary) -> void:
	_manifest = manifest

## Play a gameplay EVENT (decoupled from the asset): maps event -> sfx key via
## data/audio/sound_events.json so sounds can be re-assigned without code.
func play_event(event: String) -> void:
	var key := String(DataManager.get_dict("SOUND_EVENTS").get(event, ""))
	if key != "":
		play_sfx(key)

func play_sfx(key: String, _volume_override: float = -1.0) -> void:
	if _muted:
		return
	var def: Dictionary = _manifest.get("sfx", {}).get(key, {})
	var stream := _load_stream(String(def.get("file", "")))
	if stream == null:
		return
	var p := AudioStreamPlayer.new()
	add_child(p)
	p.stream = stream
	p.volume_db = linear_to_db(_resolve_volume(float(def.get("volume", 1.0)), _sfx_volume))
	p.finished.connect(p.queue_free)
	p.play()

func play_music(key: String, _crossfade_ms: float = 500.0) -> void:
	if _muted:
		return
	if key == _current_music_key and _music_player.playing:
		return
	var def: Dictionary = _manifest.get("music", {}).get(key, {})
	var stream := _load_stream(String(def.get("file", "")))
	if stream == null:
		return
	if stream is AudioStreamMP3:
		(stream as AudioStreamMP3).loop = bool(def.get("loop", true))
	_music_player.stream = stream
	_music_player.volume_db = linear_to_db(_resolve_volume(float(def.get("volume", 1.0)), _music_volume))
	_music_player.play()
	_current_music_key = key

func stop_music(_fade_ms: float = 500.0) -> void:
	_music_player.stop()
	_current_music_key = ""

## Mute or unmute everything, and remember the choice.
##
## The volume API below has existed since the audio system was written and
## nothing has ever called it -- there was no way for a player to turn the sound
## down. A game a child plays in a car, a waiting room or a classroom needs one,
## and it has to survive a reload, so the choice is persisted beside crow_locale.
##
## Mute is a separate flag rather than "master volume 0" so unmuting restores
## whatever the volume was. Mirrors AudioManager.setMuted() in the web build.
const MUTE_KEY := "crow_sound_muted"
const VOLUME_KEY := "crow_master_volume"

var _muted := false


func set_muted(muted: bool) -> void:
	_muted = muted
	# "1"/"0" rather than a bool: Persistence mirrors localStorage and stores
	# strings, and the web port writes the same two values under the same key.
	Persistence.set_item(MUTE_KEY, "1" if muted else "0")
	if muted and is_instance_valid(_music_player):
		_music_player.stop()
		_current_music_key = ""


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


## Master volume, remembered and applied at once.
##
## The setter existed since the audio system was written and did neither: it
## changed a number that only affected the *next* sound, and forgot the choice
## on the next launch. A parent turning the volume down in a waiting room needs
## it down now and down tomorrow.
func set_master_volume(v: float) -> void:
	_master_volume = clampf(v, 0.0, 1.0)
	Persistence.set_item(VOLUME_KEY, str(_master_volume))
	_apply_music_volume()

## Re-level whatever is already playing. Without this a volume change is
## inaudible until the next level loads.
func _apply_music_volume() -> void:
	if not is_instance_valid(_music_player) or _current_music_key == "":
		return
	var def: Dictionary = DataManager.get_dict("AUDIO_MANIFEST").get("music", {}).get(_current_music_key, {})
	_music_player.volume_db = linear_to_db(_resolve_volume(float(def.get("volume", 1.0)), _music_volume))


func get_master_volume() -> float: return _master_volume


func _resolve_volume(track_vol: float, category_vol: float) -> float:
	return clampf(track_vol * category_vol * _master_volume, 0.0001, 1.0)

func _load_stream(file: String) -> AudioStream:
	if file == "":
		return null
	# Manifest paths are like "assets/audio/music/level_01.mp3" (relative to data root).
	var path := "res://%s" % file
	if not ResourceLoader.exists(path):
		return null
	var res := ResourceLoader.load(path)
	return res if res is AudioStream else null
