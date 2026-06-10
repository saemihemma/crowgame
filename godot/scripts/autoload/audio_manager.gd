extends Node
## AudioManager — Godot port of src/systems/AudioManager.ts.
## Baseline music/SFX playback from data/audio/audio_manifest.json. Slice 8 adds
## pooling and music cross-fade; the API shape is kept so call sites are stable.

var _manifest: Dictionary = {}
var _master_volume := 1.0
var _music_volume := 1.0
var _sfx_volume := 1.0
var _silent := false

var _music_player: AudioStreamPlayer
var _current_music_key := ""

func _ready() -> void:
	_music_player = AudioStreamPlayer.new()
	_music_player.bus = "Master"
	add_child(_music_player)
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
	if _silent:
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
	if _silent:
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

func set_master_volume(v: float) -> void:
	_master_volume = clampf(v, 0.0, 1.0)

func set_music_volume(v: float) -> void:
	_music_volume = clampf(v, 0.0, 1.0)

func set_sfx_volume(v: float) -> void:
	_sfx_volume = clampf(v, 0.0, 1.0)

func get_master_volume() -> float: return _master_volume
func get_music_volume() -> float: return _music_volume
func get_sfx_volume() -> float: return _sfx_volume

func set_silent_mode(silent: bool) -> void:
	_silent = silent
	if silent:
		stop_music()

func is_silent() -> bool:
	return _silent

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
