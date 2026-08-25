extends Node
## CloudSync — cloud save over the Crow API. Autoload.
##
## Contract: docs/API_CONTRACT.md. The parts that matter here:
##
##  * The API base is the RELATIVE string "/api/v1". Not configurable. Caddy
##    proxies it to a private API service per environment, which is what keeps
##    staging and prod apart even though promotion ships byte-identical files.
##  * The credential is an HttpOnly cookie the browser attaches automatically.
##    This script never sees, stores, or sends a token — it cannot, and that is
##    the point: the web export has no secure storage.
##  * The sync unit is the whole save blob, arbitrated server-side by
##    eloStats.problemsAttempted. When the server says "rejected" it hands back
##    the authoritative save, and we adopt it.
##
## What this does NOT do: change SaveManager's local save cadence. Saving locally
## on every coin pickup is correct. Uploading on every coin pickup is not, so the
## upload has its own debounce.

signal state_changed(enrolled: bool)
signal sync_finished(ok: bool)

## The API path. Relative by design — see docs/API_CONTRACT.md — but Godot's
## HTTPRequest requires an ABSOLUTE url and rejects "/api/v1/...", so the page
## origin is resolved once at startup and prefixed. The design property is
## preserved: nothing is configured, and whichever environment served the page is
## the environment we talk to.
const API_PATH := "/api/v1"

var _origin := ""

## Set on the profile record so a device-local childId can be mapped to the
## server's id without renaming any existing storage key.
const REMOTE_CHILD_KEY := "remoteChildId"

@onready var FLUSH_DEBOUNCE: float = Config.ui("cloud/flush_debounce_seconds", 20.0)
@onready var REQUEST_TIMEOUT: float = Config.ui("cloud/request_timeout_seconds", 15.0)
@onready var MAX_BATCH: int = int(Config.ui("cloud/max_attempts_per_batch", 100))

var _enrolled := false
var _dirty := false
var _since_dirty := 0.0
var _in_flight := false
var _remote_child_id := ""

func _ready() -> void:
	set_process(false)
	# Cloud sync is a web-export feature: on desktop there is no cookie jar and
	# no same-origin proxy, so it stays off rather than failing every request.
	if not OS.has_feature("web"):
		return
	_origin = _resolve_origin()
	if _origin.is_empty():
		push_warning("[CloudSync] could not resolve the page origin; cloud save stays off")
		return
	EventBus.math_challenge_complete.connect(_on_challenge_complete)
	await _refresh_session()

## True when this device has a family credential.
func is_enrolled() -> bool:
	return _enrolled

# ── enrollment ──────────────────────────────────────────────────────────────

func _refresh_session() -> void:
	var res := await _request(HTTPClient.METHOD_GET, "/auth/session", {})
	var was := _enrolled
	_enrolled = res["ok"] and res["json"] is Dictionary and bool(res["json"].get("enrolled", false))
	if was != _enrolled:
		state_changed.emit(_enrolled)

## Ask the server to email a sign-in link. The link must be opened on THIS
## device, because clicking it is the top-level navigation that sets the cookie.
##
## Returns the server's `delivery` state: "configured" when mail actually goes
## out, "unavailable" when no provider is set up. That distinction matters because
## the endpoint deliberately answers the same way for known and unknown addresses
## — so without it, a parent trying to protect their child's progress would be
## told "check your email" when nothing was ever sent.
func request_login_link(email: String) -> String:
	var res := await _request(HTTPClient.METHOD_POST, "/auth/request-link", {"email": email})
	if not res["ok"]:
		return "error"
	if res["json"] is Dictionary:
		return String((res["json"] as Dictionary).get("delivery", "configured"))
	return "configured"

## Ask for a code to type into a second device.
func request_pairing_code() -> String:
	var res := await _request(HTTPClient.METHOD_POST, "/auth/pair", {})
	if res["ok"] and res["json"] is Dictionary:
		return String(res["json"].get("code", ""))
	return ""

## Redeem a code produced by an already-enrolled device.
func redeem_pairing_code(code: String) -> bool:
	var res := await _request(HTTPClient.METHOD_POST, "/auth/redeem", {"code": code})
	if res["ok"]:
		await _refresh_session()
	return res["ok"]

func sign_out() -> void:
	await _request(HTTPClient.METHOD_POST, "/auth/signout", {})
	_enrolled = false
	_remote_child_id = ""
	state_changed.emit(false)

# ── child mapping ───────────────────────────────────────────────────────────

## Bind the active local profile to a server child, then pull the cloud save.
##
## The mapping is why a second device does not create a duplicate child: the
## client mints childId per device ("child-<ms>-<rand>"), so the server is told
## the local id and returns the one true child for it.
func bind_active_profile() -> void:
	if not _enrolled:
		return
	var profile: Variant = ProfileManager.get_active_profile()
	if not (profile is Dictionary):
		return

	var cached := String(profile.get(REMOTE_CHILD_KEY, ""))
	if cached != "":
		_remote_child_id = cached
	else:
		var res := await _request(HTTPClient.METHOD_POST, "/family/children", {
			"displayName": String(profile.get("username", "")),
			"legacyChildId": String(profile.get("childId", "")),
		})
		if not (res["ok"] and res["json"] is Dictionary):
			return
		_remote_child_id = String(res["json"].get("remoteChildId", ""))
		if _remote_child_id != "":
			ProfileManager.set_profile_field(
				String(profile.get("username", "")), REMOTE_CHILD_KEY, _remote_child_id)

	if _remote_child_id != "":
		await pull_save()

## The parent report: the server's lifetime, cross-device rollup for one child
## (per domain and per problem kind). Empty when this device is not enrolled or
## the profile was never bound to a server child — the ParentReport scene then
## falls back to what this device has seen locally.
func fetch_child_report(profile: Dictionary) -> Dictionary:
	if not _enrolled:
		return {}
	var remote := String(profile.get(REMOTE_CHILD_KEY, ""))
	if remote == "":
		return {}
	var res := await _request(HTTPClient.METHOD_GET, "/family/children/%s/report" % remote, {})
	if res["ok"] and res["json"] is Dictionary:
		return res["json"]
	return {}

## Fetch the authoritative save and adopt it when the server is ahead.
func pull_save() -> void:
	if _remote_child_id == "":
		return
	var res := await _request(HTTPClient.METHOD_GET, "/children/%s/save" % _remote_child_id, {})
	if not (res["ok"] and res["json"] is Dictionary):
		return  # 404 simply means this child has no cloud save yet.
	var remote: Dictionary = res["json"]
	var remote_attempted := int(remote.get("problemsAttempted", 0))
	if remote_attempted > SaveManager.get_problems_attempted():
		SaveManager.adopt_remote_save(remote.get("save", {}))

# ── upload ──────────────────────────────────────────────────────────────────

func mark_dirty() -> void:
	if not _enrolled or _remote_child_id == "":
		return
	_dirty = true
	_since_dirty = 0.0
	set_process(true)

func _process(delta: float) -> void:
	_since_dirty += delta
	if _dirty and not _in_flight and _since_dirty >= FLUSH_DEBOUNCE:
		flush_now()

func _notification(what: int) -> void:
	# APPLICATION_PAUSED is the reliable "the player is leaving" signal on a
	# mobile browser. Page-unload is not dependable on the web, so it is not
	# relied on here.
	match what:
		NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_WM_CLOSE_REQUEST:
			flush_now()

func flush_now() -> void:
	if not _enrolled or _remote_child_id == "" or _in_flight or not _dirty:
		return
	_in_flight = true
	_dirty = false
	set_process(false)

	var save_data: Dictionary = SaveManager.get_data()
	# The pending queue is keyed by the DEVICE-LOCAL childId, which is what the
	# existing storage key uses. The server is addressed by the remote id. Both
	# ids are in play on purpose — see docs/API_CONTRACT.md.
	var local_child_id := _local_child_id()
	var pending: Array = LearnerSyncService.take_pending_attempts(local_child_id, MAX_BATCH)
	var res := await _request(HTTPClient.METHOD_PUT, "/children/%s/save" % _remote_child_id, {
		"save": save_data,
		"saveVersion": SaveManager.get_save_version(),
		"clientTimestamp": int(save_data.get("timestamp", 0)),
		"attempts": pending,
	})
	_in_flight = false

	if not (res["ok"] and res["json"] is Dictionary):
		# Nothing is lost: the local save is authoritative on this device and the
		# attempts stay queued. Mark dirty again so the next debounce retries.
		_dirty = true
		set_process(true)
		sync_finished.emit(false)
		return

	var body: Dictionary = res["json"]
	# Clear ONLY the attempts the server confirmed durable.
	LearnerSyncService.confirm_attempts(local_child_id, body.get("appliedAttemptIds", []))

	if String(body.get("outcome", "")) == "rejected":
		# Another device has seen more of this child's answers. Adopt its save;
		# our attempts are already recorded server-side either way.
		var state: Variant = body.get("state", {})
		if state is Dictionary:
			SaveManager.adopt_remote_save(state.get("save", {}))
	sync_finished.emit(true)

func _on_challenge_complete(_payload: Dictionary) -> void:
	mark_dirty()

## The origin of the page that served this build. Read from the browser rather
## than configured, which is what keeps staging and prod apart even though
## promotion ships byte-identical files to both.
func _resolve_origin() -> String:
	if not OS.has_feature("web"):
		return ""
	var value: Variant = JavaScriptBridge.eval("window.location.origin", true)
	return String(value) if value != null else ""

func _local_child_id() -> String:
	var profile: Variant = ProfileManager.get_active_profile()
	return String(profile.get("childId", "")) if profile is Dictionary else ""

# ── transport ───────────────────────────────────────────────────────────────

## Minimal JSON helper. Cookies are attached by the browser, so there is no
## Authorization header to build and no token to leak.
func _request(method: int, path: String, body: Variant) -> Dictionary:
	var http := HTTPRequest.new()
	http.timeout = REQUEST_TIMEOUT
	add_child(http)
	var headers := PackedStringArray(["Content-Type: application/json"])
	var payload := "" if (body is Dictionary and (body as Dictionary).is_empty()) else JSON.stringify(body)
	var err := http.request(_origin + API_PATH + path, headers, method, payload)
	if err != OK:
		http.queue_free()
		return {"ok": false, "json": null, "code": 0}
	var result: Array = await http.request_completed
	http.queue_free()
	var code := int(result[1])
	# Only parse a body that is actually JSON. A 404 or a 503 from the edge is
	# HTML, and handing that to JSON.parse_string logs a parse error for something
	# that is not an error at all — the game runs local-only when no API is
	# reachable, which is the intended degraded state.
	var text := (result[3] as PackedByteArray).get_string_from_utf8().strip_edges()
	var parsed: Variant = null
	if text.begins_with("{") or text.begins_with("["):
		parsed = JSON.parse_string(text)
	return {"ok": code >= 200 and code < 300, "json": parsed, "code": code}
