extends Node
## Persistence — a localStorage-equivalent key/value store over `user://`.
##
## The TS game persists everything in browser localStorage under named keys
## (crow_save_<username>, crow_profiles, crow_learner_snapshot_<childId>, ...).
## To keep that contract byte-for-byte, all managers read/write through this
## autoload instead of touching files directly. Backed by a single JSON file so
## the whole key space round-trips like localStorage does.

const STORE_PATH := "user://crow_localstorage.json"
const FLUSH_DEBOUNCE := 0.5

var _store: Dictionary = {}
var _dirty := false
var _since_write := 0.0

func _ready() -> void:
	_load()
	set_process(false)

func get_item(key: String) -> Variant:
	# Returns the stored string, or null when absent (mirrors localStorage).
	return _store.get(key, null)

func set_item(key: String, value: String) -> void:
	_store[key] = value
	_mark_dirty()

func remove_item(key: String) -> void:
	if _store.has(key):
		_store.erase(key)
		_mark_dirty()

func has_item(key: String) -> bool:
	return _store.has(key)


## Debounced disk writes: reads always hit the in-memory store, so persistence
## semantics are unchanged, but rapid auto-saves (every coin pickup) coalesce
## into one file write — important on the Web export where user:// I/O is
## emulated. Flushes after FLUSH_DEBOUNCE idle and on quit/background.
func _mark_dirty() -> void:
	_dirty = true
	_since_write = 0.0
	set_process(true)

func _process(delta: float) -> void:
	_since_write += delta
	if _dirty and _since_write >= FLUSH_DEBOUNCE:
		flush_now()

func flush_now() -> void:
	if _dirty:
		_flush()
		_dirty = false
	set_process(false)

func _notification(what: int) -> void:
	match what:
		NOTIFICATION_WM_CLOSE_REQUEST, NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_EXIT_TREE:
			flush_now()

func _load() -> void:
	if not FileAccess.file_exists(STORE_PATH):
		return
	var f := FileAccess.open(STORE_PATH, FileAccess.READ)
	if f == null:
		return
	var raw := f.get_as_text()
	f.close()
	var parsed: Variant = JSON.parse_string(raw)
	if parsed is Dictionary:
		_store = parsed

func _flush() -> void:
	var f := FileAccess.open(STORE_PATH, FileAccess.WRITE)
	if f == null:
		push_warning("[Persistence] could not open %s for write" % STORE_PATH)
		return
	f.store_string(JSON.stringify(_store))
	f.close()
