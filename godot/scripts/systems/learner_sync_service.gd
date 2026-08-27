extends Node
## LearnerSyncService — the local snapshot cache and pending-attempt queue.
##
## IMPORTANT: its remote paths are NOT the live transport.
##
## The `{api_base}/learner/{childId}/...` requests below are the PRE-CONTRACT
## shape. ARCHITECTURE.md declares that shape void — childId was never a
## usable authorization subject — and no server route implements it. They are
## inert: get_api_base() returns null outside a debug build.
##
## The live transport is cloud_sync.gd, which talks to the same-origin /api/v1
## with a device cookie. What is still load-bearing HERE is the local side: the
## snapshot cache and the pending-attempt queue, which cloud_sync.gd drains via
## take_pending_attempts() / confirm_attempts().
##
## Local snapshot cache + pending-attempt queue with optional hosted sync.
## Storage keys are identical to the web build:
##   crow_learner_api_base, crow_learner_snapshot_<childId>,
##   crow_learner_pending_attempts_<childId>
## Behavior mirrors TS exactly: every attempt is enqueued first (the queue only
## drains when a backend confirms applied ids); with no API base configured the
## service is local-only — snapshot cached, sync status 'local-only', queue kept.
## Remote calls use HTTPRequest; failures fall back to cache and mark 'pending'.

const API_BASE_KEY := "crow_learner_api_base"

var _active_child_id: Variant = null

func init(snapshot: Dictionary) -> void:
	_active_child_id = snapshot.get("childId", null)
	cache_snapshot(snapshot)
	if get_api_base() != null:
		_refresh_remote_state(String(_active_child_id))

func _refresh_remote_state(child_id: String) -> void:
	await get_learner_snapshot(child_id)
	await sync_pending_attempts(child_id)

func get_learner_snapshot(child_id: String) -> Dictionary:
	var cached: Variant = get_cached_snapshot(child_id)
	var fallback: Dictionary = cached if cached is Dictionary else LearnerStateManager.get_snapshot()
	var api_base: Variant = get_api_base()
	if api_base == null:
		return fallback
	var res := await _http_json(HTTPClient.METHOD_GET, "%s/learner/%s/snapshot" % [api_base, String(child_id).uri_encode()], null)
	if not res["ok"] or not (res["json"] is Dictionary):
		return fallback
	var snapshot := _normalize_snapshot(res["json"], child_id)
	cache_snapshot(snapshot)
	if _active_child_id != null and String(_active_child_id) == child_id:
		LearnerStateManager.replace_snapshot(snapshot)
	return snapshot

func submit_attempt(attempt: Dictionary) -> Dictionary:
	_enqueue_attempt(attempt)
	var local_snapshot := LearnerStateManager.get_snapshot()
	cache_snapshot(local_snapshot)

	var api_base: Variant = get_api_base()
	if api_base == null:
		LearnerStateManager.update_sync_metadata("local-only", local_snapshot.get("latestSyncCursor"), local_snapshot.get("lastSyncedAt"))
		var local_only := LearnerStateManager.get_snapshot()
		cache_snapshot(local_only)
		return {"snapshot": local_only, "appliedAttemptIds": [], "latestSyncCursor": local_only.get("latestSyncCursor")}

	var child_id := String(attempt.get("childId", ""))
	var res := await _http_json(HTTPClient.METHOD_POST, "%s/learner/%s/attempt" % [api_base, child_id.uri_encode()], attempt)
	if res["ok"] and res["json"] is Dictionary:
		return _apply_sync_result(res["json"], local_snapshot, child_id)
	return _mark_pending(local_snapshot)

func sync_pending_attempts(child_id: String, pending_attempts: Variant = null) -> Dictionary:
	var api_base: Variant = get_api_base()
	var attempts: Array = pending_attempts if pending_attempts is Array else get_queued_attempts(child_id)
	var cached: Variant = get_cached_snapshot(child_id)
	var local_snapshot: Dictionary = cached if cached is Dictionary else LearnerStateManager.get_snapshot()

	if api_base == null or attempts.is_empty():
		return {"snapshot": local_snapshot, "appliedAttemptIds": [], "latestSyncCursor": local_snapshot.get("latestSyncCursor")}

	var res := await _http_json(HTTPClient.METHOD_POST, "%s/learner/%s/attempts/sync" % [api_base, String(child_id).uri_encode()], {"attempts": attempts})
	if res["ok"] and res["json"] is Dictionary:
		return _apply_sync_result(res["json"], local_snapshot, child_id)
	return _mark_pending(local_snapshot)

# ─── internals ────────────────────────────────────────────

func _apply_sync_result(result: Dictionary, local_snapshot: Dictionary, child_id: String) -> Dictionary:
	var applied: Array = result.get("appliedAttemptIds", [])
	_remove_queued_attempts(child_id, applied)
	var raw: Variant = result.get("snapshot", null)
	var synced := _normalize_snapshot(raw if raw is Dictionary else local_snapshot, child_id)
	LearnerStateManager.replace_snapshot(synced)
	LearnerStateManager.update_sync_metadata("synced", result.get("latestSyncCursor"), int(Time.get_unix_time_from_system() * 1000.0))
	var latest := LearnerStateManager.get_snapshot()
	cache_snapshot(latest)
	return {"snapshot": latest, "appliedAttemptIds": applied, "latestSyncCursor": result.get("latestSyncCursor")}

func _mark_pending(local_snapshot: Dictionary) -> Dictionary:
	LearnerStateManager.update_sync_metadata("pending", local_snapshot.get("latestSyncCursor"), local_snapshot.get("lastSyncedAt"))
	var pending := LearnerStateManager.get_snapshot()
	cache_snapshot(pending)
	return {"snapshot": pending, "appliedAttemptIds": [], "latestSyncCursor": pending.get("latestSyncCursor")}

## Returns the configured API base (trailing slash stripped) or null.
## The learner API base.
##
## In a shipped build this is NOT configurable. It used to be read from
## client-writable storage (crow_learner_api_base), which meant any script on the
## origin could redirect a child's learning records to a server of its choosing.
## The real base is the relative path CloudSync uses ("/api/v1"), proxied
## same-origin per environment — see ARCHITECTURE.md.
##
## The override survives only in debug builds, for pointing a local editor run at
## a local API.
func get_api_base() -> Variant:
	if not OS.is_debug_build():
		return null
	var raw: Variant = Persistence.get_item(API_BASE_KEY)
	if raw == null:
		return null
	var s := String(raw).strip_edges()
	if s.is_empty():
		return null
	return s.trim_suffix("/")

func cache_snapshot(snapshot: Dictionary) -> void:
	Persistence.set_item(_snapshot_key(String(snapshot.get("childId", ""))), JSON.stringify(snapshot))

func get_cached_snapshot(child_id: String) -> Variant:
	var raw: Variant = Persistence.get_item(_snapshot_key(child_id))
	if raw == null:
		return null
	var parsed: Variant = JSON.parse_string(String(raw))
	return parsed if parsed is Dictionary else null

func _enqueue_attempt(attempt: Dictionary) -> void:
	var child_id := String(attempt.get("childId", ""))
	var queue := get_queued_attempts(child_id)
	for entry in queue:
		if entry.get("attemptId", "") == attempt.get("attemptId", ""):
			return
	queue.append(attempt)
	_save_queued_attempts(child_id, queue)

func _remove_queued_attempts(child_id: String, applied_ids: Array) -> void:
	var kept: Array = []
	for attempt in get_queued_attempts(child_id):
		if not applied_ids.has(attempt.get("attemptId", "")):
			kept.append(attempt)
	_save_queued_attempts(child_id, kept)

## Public queue accessors for CloudSync. The queue, its storage key and its
## semantics are unchanged: every attempt is enqueued on completion, and only ids
## the server confirms applied are ever removed.
func take_pending_attempts(child_id: String, limit: int) -> Array:
	var queued := get_queued_attempts(child_id)
	return queued.slice(0, mini(limit, queued.size()))

func confirm_attempts(child_id: String, applied_ids: Array) -> void:
	if applied_ids.is_empty():
		return
	_remove_queued_attempts(child_id, applied_ids)

func get_queued_attempts(child_id: String) -> Array:
	var raw: Variant = Persistence.get_item(_pending_key(child_id))
	if raw == null:
		return []
	var parsed: Variant = JSON.parse_string(String(raw))
	return parsed if parsed is Array else []

func _save_queued_attempts(child_id: String, attempts: Array) -> void:
	Persistence.set_item(_pending_key(child_id), JSON.stringify(attempts))

func _snapshot_key(child_id: String) -> String:
	return "crow_learner_snapshot_%s" % child_id

func _pending_key(child_id: String) -> String:
	return "crow_learner_pending_attempts_%s" % child_id

func _normalize_snapshot(snapshot: Dictionary, requested_child_id: String) -> Dictionary:
	var normalized := snapshot.duplicate(true)
	normalized["childId"] = requested_child_id
	var profile: Variant = ProfileManager.get_active_profile()
	if profile is Dictionary and String(profile.get("childId", "")) == requested_child_id:
		normalized["childId"] = profile["childId"]
		normalized["familyId"] = profile["familyId"]
	return normalized

## One-shot JSON HTTP call. Returns { ok: bool, json: Variant }.
func _http_json(method: HTTPClient.Method, url: String, body: Variant) -> Dictionary:
	var req := HTTPRequest.new()
	add_child(req)
	var headers := PackedStringArray(["Content-Type: application/json"])
	var payload := JSON.stringify(body) if body != null else ""
	var err := req.request(url, headers, method, payload)
	if err != OK:
		req.queue_free()
		return {"ok": false, "json": null}
	var result: Array = await req.request_completed
	req.queue_free()
	var http_result := int(result[0])
	var code := int(result[1])
	var resp_body: PackedByteArray = result[3]
	if http_result != HTTPRequest.RESULT_SUCCESS or code < 200 or code >= 300:
		return {"ok": false, "json": null}
	return {"ok": true, "json": JSON.parse_string(resp_body.get_string_from_utf8())}
