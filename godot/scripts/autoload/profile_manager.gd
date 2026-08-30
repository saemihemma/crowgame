extends Node
## ProfileManager — ported from the retired Phaser build; this is now the only implementation.
## Multi-user profiles (username + 4-digit PIN). Each profile maps to its own
## save key `crow_save_<username>`. Storage keys are identical to the web build.

const PROFILES_KEY := "crow_profiles"
const ACTIVE_KEY := "crow_active_user"
const FAMILY_KEY := "crow_family_id"
const LEGACY_SAVE_KEY := "crow_save_v1"
## The name field and the validator both need this, and they were two
## separate literal 12s: the field would have stopped accepting typing at
## one length while the error fired at another.
const NAME_MAX_LENGTH := 12

# Each profile: { username, pinHash, createdAt, childId, familyId }
var _profiles: Array = []
var _active_user: Variant = null  # String or null

func _ready() -> void:
	_load()

func get_profiles() -> Array:
	return _profiles.duplicate(true)

func get_active_user() -> Variant:
	return _active_user

func get_active_profile() -> Variant:
	if _active_user == null:
		return null
	for p in _profiles:
		if String(p.get("username", "")).to_lower() == String(_active_user).to_lower():
			return p
	return null

func get_save_key_for_user(username: String) -> String:
	return "crow_save_%s" % username

func get_active_save_key() -> String:
	if _active_user != null:
		return get_save_key_for_user(String(_active_user))
	return LEGACY_SAVE_KEY

## Returns true on success, or a STRING TABLE KEY on failure.
##
## It used to return the English sentence itself, and login.gd put that straight
## on the screen -- so an Icelandic child who picked a name someone already had
## read "Name already taken!" in the middle of an Icelandic game. The keys for
## all four of these were sitting unused in both bundles. A key rather than a
## sentence also keeps the wording out of an autoload that has no business
## owning copy.
## birth_year is optional (0 = unknown): the grade comparison in the parent
## report needs only the YEAR, because Icelandic school grade is a function of
## birth year alone (see docs/GRADE_EXPECTATIONS.md). Never required — a family
## that skips it just gets no grade section.
func create_profile(username: String, pin: String, birth_year: int = 0) -> Variant:
	var trimmed := username.strip_edges()
	if trimmed.is_empty():
		return "login.name_empty"
	if trimmed.length() > NAME_MAX_LENGTH:
		return "login.name_too_long"
	if not _is_four_digits(pin):
		return "login.pin_four_digits"
	for p in _profiles:
		if String(p.get("username", "")).to_lower() == trimmed.to_lower():
			return "login.name_taken"
	var profile := {
		"username": trimmed,
		"pinHash": _hash_pin(trimmed, pin),
		"createdAt": _now_ms(),
		"childId": _generate_id("child"),
		"familyId": _get_or_create_family_id(),
	}
	if birth_year > 0:
		profile["birthYear"] = birth_year
	_profiles.append(profile)
	_save()
	return true

func login(username: String, pin: String) -> bool:
	for p in _profiles:
		if String(p.get("username", "")).to_lower() == username.to_lower():
			if String(p.get("pinHash", "")) != _hash_pin(String(p.get("username", "")), pin):
				return false
			_active_user = p.get("username")
			Persistence.set_item(ACTIVE_KEY, String(_active_user))
			return true
	return false

func logout() -> void:
	_active_user = null
	Persistence.remove_item(ACTIVE_KEY)

func delete_profile(username: String) -> void:
	var removed: Variant = null
	var kept: Array = []
	for p in _profiles:
		if String(p.get("username", "")).to_lower() == username.to_lower():
			removed = p
		else:
			kept.append(p)
	_profiles = kept
	Persistence.remove_item(get_save_key_for_user(username))
	if removed != null and removed.get("childId", "") != "":
		var cid: String = removed["childId"]
		Persistence.remove_item("crow_learner_snapshot_%s" % cid)
		Persistence.remove_item("crow_learner_pending_attempts_%s" % cid)
	if _active_user != null and String(_active_user).to_lower() == username.to_lower():
		logout()
	_save()

## Set one field on a stored profile. Used to record the server-issued
## remoteChildId next to the device-local childId — the local ids stay exactly as
## they are, so no installed save or snapshot key changes.
func set_profile_field(username: String, key: String, value: Variant) -> void:
	for p in _profiles:
		if String(p.get("username", "")) == username:
			p[key] = value
			_save()
			return

## One stored profile by name, or null.
##
## Case-insensitive, like login() and create_profile(): "Saemi" and "saemi" are
## one child everywhere else here, and a lookup that disagreed would let the
## sign-in screen create a second profile for a name it had just been told
## already exists.
func get_profile(username: String) -> Variant:
	for p in _profiles:
		if String(p.get("username", "")).to_lower() == username.strip_edges().to_lower():
			return p
	return null

## Overwrite a local profile's PIN.
##
## Exists for exactly one caller: a child signing in on a shared machine that
## already holds a profile under their name with a different PIN. The SERVER has
## just authenticated them, so of the two records the local one is the stale
## copy, and refusing to update it would leave a child locked out of their own
## save by a name collision on somebody else's computer.
##
## Nothing else may call this. A PIN change from inside the game would be a way
## to take another child's profile on a shared tablet, which is the thing the PIN
## is there to prevent -- godot/tests/test_grownup_surfaces.gd holds the line.
func set_profile_pin(username: String, pin: String) -> bool:
	if not _is_four_digits(pin):
		return false
	for p in _profiles:
		if String(p.get("username", "")).to_lower() == username.strip_edges().to_lower():
			p["pinHash"] = _hash_pin(String(p.get("username", "")), pin)
			_save()
			return true
	return false

func has_profiles() -> bool:
	return _profiles.size() > 0

# ─── Internal ─────────────────────────────────────────────

func _hash_pin(username: String, pin: String) -> String:
	# Mirrors btoa(pin + ':' + username.toLowerCase()).
	return Marshalls.utf8_to_base64("%s:%s" % [pin, username.to_lower()])

func _is_four_digits(pin: String) -> bool:
	if pin.length() != 4:
		return false
	for c in pin:
		if c < "0" or c > "9":
			return false
	return true

func _load() -> void:
	var profiles_changed := false
	var raw: Variant = Persistence.get_item(PROFILES_KEY)
	if raw != null:
		var parsed: Variant = JSON.parse_string(String(raw))
		_profiles = parsed if parsed is Array else []
	var family_id := _get_or_create_family_id()
	for i in _profiles.size():
		var p: Dictionary = _profiles[i]
		if p.get("childId", "") != "" and p.get("familyId", "") != "":
			continue
		profiles_changed = true
		if p.get("childId", "") == "":
			p["childId"] = _generate_id("child")
		if p.get("familyId", "") == "":
			p["familyId"] = family_id
		_profiles[i] = p
	var active: Variant = Persistence.get_item(ACTIVE_KEY)
	_active_user = active  # String or null
	if profiles_changed:
		_save()

func _save() -> void:
	Persistence.set_item(PROFILES_KEY, JSON.stringify(_profiles))

func _get_or_create_family_id() -> String:
	var existing: Variant = Persistence.get_item(FAMILY_KEY)
	if existing != null:
		return String(existing)
	var next := _generate_id("family")
	Persistence.set_item(FAMILY_KEY, next)
	return next

func _generate_id(prefix: String) -> String:
	return "%s-%d-%d" % [prefix, _now_ms(), randi() % 1000000]

func _now_ms() -> int:
	return int(Time.get_unix_time_from_system() * 1000.0)
