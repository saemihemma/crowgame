extends Node
## Persistence — a localStorage-equivalent key/value store over `user://`.
##
## The TS game persists everything in browser localStorage under named keys
## (crow_save_<username>, crow_profiles, crow_learner_snapshot_<childId>, ...).
## To keep that contract byte-for-byte, all managers read/write through this
## autoload instead of touching files directly. Backed by a single JSON file so
## the whole key space round-trips like localStorage does.

const STORE_PATH := "user://crow_localstorage.json"

var _store: Dictionary = {}

func _ready() -> void:
	_load()

func get_item(key: String) -> Variant:
	# Returns the stored string, or null when absent (mirrors localStorage).
	return _store.get(key, null)

func set_item(key: String, value: String) -> void:
	_store[key] = value
	_flush()

func remove_item(key: String) -> void:
	if _store.has(key):
		_store.erase(key)
		_flush()

func has_item(key: String) -> bool:
	return _store.has(key)

func clear_all() -> void:
	_store.clear()
	_flush()

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
