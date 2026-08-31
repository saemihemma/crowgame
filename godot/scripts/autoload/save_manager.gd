extends Node
## SaveManager — ported from the retired Phaser build; this is now the only implementation.
## Profile-aware persistence over Persistence (user://). Same SaveData shape,
## same auto-save-on-event behaviour. ELO/learner hooks plug in at slice 3 and
## are read defensively until then.

const SAVE_VERSION := 1

var _data: Dictionary = {}
var _auto_save_enabled := true

func _ready() -> void:
	_data = _create_default_save()
	load_save()
	_register_listeners()

func _get_save_key() -> String:
	return ProfileManager.get_active_save_key()

## Read-only snapshot (callers must not mutate; mirrors getData()).
func get_data() -> Dictionary:
	return _data

func save() -> void:
	_data["timestamp"] = _now_ms()
	var elo := get_node_or_null("/root/ELOManager")
	if elo != null and elo.has_method("get_stats"):
		_data["eloStats"] = elo.get_stats()
	var learner := get_node_or_null("/root/LearnerStateManager")
	if learner != null and learner.has_method("is_initialized") and learner.is_initialized():
		_data["learnerState"] = learner.get_snapshot()
	Persistence.set_item(_get_save_key(), JSON.stringify(_data))

func load_save() -> void:
	var raw: Variant = Persistence.get_item(_get_save_key())
	if raw != null:
		var parsed: Variant = JSON.parse_string(String(raw))
		if parsed is Dictionary:
			parsed = migrate_save(parsed)
		if parsed is Dictionary and int(parsed.get("version", -1)) == SAVE_VERSION:
			var defaults := _create_default_save()
			# Shallow-merge defaults <- parsed (parsed wins), like {...defaults, ...parsed}.
			_data = defaults.duplicate(true)
			for k in parsed:
				_data[k] = parsed[k]
			# Deep-merge the nested objects spread would have flattened.
			_data["mathStats"] = _merge(defaults["mathStats"], parsed.get("mathStats", {}))
			_data["telemetry"] = _merge(defaults["telemetry"], parsed.get("telemetry", {}))
			_data["settings"] = _merge(defaults["settings"], parsed.get("settings", {}))
			_data["tutorialsSeen"] = _merge(defaults["tutorialsSeen"], parsed.get("tutorialsSeen", {}))
			if parsed.has("learnerState"):
				_data["learnerState"] = parsed["learnerState"]
			return
	_data = _create_default_save()

## Migration seam: upgrade an older save dict toward SAVE_VERSION so schema
## changes never discard a child's progress. Add one step per version bump.
## A save with no version is treated as v1 (the original shape). A newer-than-
## known version is left as-is (load_save then falls back to defaults safely —
## we never downgrade an unknown future schema).
func migrate_save(parsed: Dictionary) -> Dictionary:
	var data := parsed.duplicate(true)
	var v := int(data.get("version", 1))
	# while v < SAVE_VERSION: match v: 1: <upgrade v1 -> v2 here>; v += 1
	# v1 is current — no migration steps yet; the seam + tests guard future bumps.
	if not data.has("version"):
		data["version"] = v
	return data

func switch_profile() -> void:
	_data = _create_default_save()
	load_save()

func clear() -> void:
	Persistence.remove_item(_get_save_key())
	var active = ProfileManager.get_active_profile()
	if active != null and active.get("childId", "") != "":
		var cid: String = active["childId"]
		Persistence.remove_item("crow_learner_snapshot_%s" % cid)
		Persistence.remove_item("crow_learner_pending_attempts_%s" % cid)
	_data = _create_default_save()

## The cloud-save arbiter. Read from eloStats, which is where ELOManager's state
## is embedded on save() — the same number the server compares.
func get_problems_attempted() -> int:
	var elo: Variant = _data.get("eloStats", {})
	if elo is Dictionary:
		return int((elo as Dictionary).get("problemsAttempted", 0))
	return 0

func get_save_version() -> int:
	return SAVE_VERSION

## Replace local state with a save the server says is authoritative.
##
## Runs the same migrate_save() path as a disk load, because a save that has been
## sitting in the cloud can be older than this build. Then rehydrates the
## in-memory systems: a save blob on its own changes nothing a player can see
## until ELO and learner state are restored from it.
func adopt_remote_save(remote: Variant) -> void:
	if not (remote is Dictionary) or (remote as Dictionary).is_empty():
		return
	var adopted := migrate_save(remote as Dictionary)
	# Records MERGE rather than being replaced, unlike everything else here.
	#
	# The sync arbitrates whole saves by problems_attempted, so the blob with more
	# maths wins outright -- and a best run is the one thing in the save that is
	# monotone and mergeable. Without this, a hard coin found on the iPad is
	# thrown away by a phone that happens to have answered more questions, and the
	# child is simply told they never found it.
	adopted["levelRecords"] = _merge_level_records(
		_data.get("levelRecords", {}), adopted.get("levelRecords", {}))
	_data = adopted
	Persistence.set_item(_get_save_key(), JSON.stringify(_data))
	# initialize() is the real rehydrate entry point — the same one ELOManager
	# uses at boot when it reads save.eloStats. There is no load_stats().
	if _data.has("eloStats"):
		ELOManager.initialize(_data["eloStats"])
	if _data.has("learnerState"):
		LearnerStateManager.replace_snapshot(_data["learnerState"])
	EventBus.save_adopted.emit()

## Best-of, level by level: the union of the big coins and the higher owl count.
## Order does not matter, which is what makes it safe to run on a sync.
func _merge_level_records(mine: Variant, theirs: Variant) -> Dictionary:
	var out: Dictionary = {}
	for source in [mine, theirs]:
		if not (source is Dictionary):
			continue
		for key: String in (source as Dictionary):
			var record: Variant = (source as Dictionary)[key]
			if not (record is Dictionary):
				continue
			var merged: Dictionary = out.get(key, {"bigCoins": [], "owls": 0, "perfect": false})
			var found: Array = merged["bigCoins"]
			var incoming: Variant = (record as Dictionary).get("bigCoins", [])
			if incoming is Array:
				for id in incoming:
					var text := String(id)
					if text != "" and not found.has(text):
						found.append(text)
			found.sort()
			merged["bigCoins"] = found
			merged["owls"] = maxi(int(merged["owls"]), int((record as Dictionary).get("owls", 0)))
			# A perfect run on either device is a perfect run. Merging it as OR
			# rather than last-writer-wins is the same rule the coins and the owl
			# count already follow: this record only ever grows.
			merged["perfect"] = bool(merged.get("perfect", false)) \
				or bool((record as Dictionary).get("perfect", false))
			out[key] = merged
	return out


func has_save() -> bool:
	return Persistence.has_item(_get_save_key())

# --- Convenience mutators ---

func add_coins(amount: int) -> void:
	_data["coins"] = int(_data["coins"]) + amount
	if _auto_save_enabled: save()


func increment_owls_saved() -> void:
	_data["owlsSaved"] = int(_data["owlsSaved"]) + 1
	if _auto_save_enabled: save()

func set_current_level(level: String) -> void:
	_data["currentLevel"] = level
	if _auto_save_enabled: save()

func complete_level(level_key: String) -> void:
	# Saves written before this key existed have no completedLevels; backfill
	# instead of crashing the first level completion on an old profile.
	if not (_data.get("completedLevels") is Array):
		_data["completedLevels"] = []
	if not (_data["completedLevels"] as Array).has(level_key):
		(_data["completedLevels"] as Array).append(level_key)
	if _auto_save_enabled: save()

## How many questions the per-question log remembers.
##
## Sixty is about a fortnight of ordinary play for this child, and it is the
## window a parent can actually use: "what happened in the last few sessions",
## not an archive. It is also a size that can ride along in the save blob that
## syncs to the server without turning a sync into an upload -- the LIFETIME
## record already lives server-side in the `attempts` table, which is where a
## long history belongs.
const ATTEMPT_LOG_MAX := 60

func record_math_attempt(attempt: Dictionary) -> void:
	# attempt: { skills, correct, firstAttempt, hintsUsed, timeMs, problemId,
	#            domain, curriculumStep, answeredAt }
	var stats: Dictionary = _data["mathStats"]
	if attempt.get("correct", false):
		stats["totalCorrect"] = int(stats["totalCorrect"]) + 1
	else:
		stats["totalWrong"] = int(stats["totalWrong"]) + 1
	var by_skill: Dictionary = stats["bySkill"]
	for skill in attempt.get("skills", []):
		if not by_skill.has(skill):
			by_skill[skill] = {"correct": 0, "wrong": 0, "avgTimeMs": 0.0}
		var entry: Dictionary = by_skill[skill]
		if attempt.get("correct", false):
			entry["correct"] = int(entry["correct"]) + 1
		else:
			entry["wrong"] = int(entry["wrong"]) + 1
		var total: int = int(entry["correct"]) + int(entry["wrong"])
		entry["avgTimeMs"] = ((float(entry["avgTimeMs"]) * (total - 1)) + float(attempt.get("timeMs", 0.0))) / total
	var tel: Dictionary = _data["telemetry"]
	tel["hintUsage"] = int(tel["hintUsage"]) + int(attempt.get("hintsUsed", 0))
	tel["problemsAttempted"] = int(tel["problemsAttempted"]) + 1
	var answered: Array = tel["answeredProblemIds"]
	answered.append(attempt.get("problemId", ""))
	if answered.size() > 100:
		tel["answeredProblemIds"] = answered.slice(answered.size() - 100)

	# THE PER-QUESTION LOG, which is a different thing from every counter above.
	#
	# The counters answer "how is it going" and the report was built entirely out
	# of them: percentages per domain, per kind of question, per rung. The owner
	# asked for the other half -- "a log per problem" -- and there was nothing in
	# the save that could produce one. `answeredProblemIds` is only a dedupe list;
	# it does not record whether the child got them right.
	#
	# Which matters because a percentage cannot answer the question a parent
	# actually sits down with: "63% in Taking away" says a rough patch exists
	# somewhere, and the log says it was five 12-minus-something questions in a
	# row on Tuesday. One of those you can help with.
	#
	# Newest LAST, like every other append-and-trim list here; the report reverses
	# it once, where the reader is.
	var log: Array = tel.get("attemptLog", [])
	log.append({
		"id": String(attempt.get("problemId", "")),
		"domain": String(attempt.get("domain", "")),
		"correct": bool(attempt.get("correct", false)),
		"firstTry": bool(attempt.get("firstAttempt", false)),
		"hints": int(attempt.get("hintsUsed", 0)),
		"ms": int(attempt.get("timeMs", 0)),
		"at": int(attempt.get("answeredAt", _now_ms())),
		"step": int(attempt.get("curriculumStep", 0)),
	})
	if log.size() > ATTEMPT_LOG_MAX:
		log = log.slice(log.size() - ATTEMPT_LOG_MAX)
	tel["attemptLog"] = log
	if _auto_save_enabled: save()


## What a level's best run left behind: which big coins were banked, and the most
## owls ever freed there.
##
## Keyed by level, and NOT part of `coins`. An ordinary coin goes into a lifetime
## purse that only rises; these are a third of a level's progress each, and they
## are the thing the completion percentage is built out of.
##
## A missing level reads as an empty record rather than an error, so a save
## written before this existed needs no migration - the shallow merge in
## load_save() supplies the empty dictionary.
func get_level_record(level_key: String) -> Dictionary:
	var records: Variant = _data.get("levelRecords", {})
	if not (records is Dictionary):
		return {}
	var one: Variant = (records as Dictionary).get(level_key, {})
	return one if one is Dictionary else {}

## Has this child already banked this particular big coin in this level?
##
## By id, never by index: the id comes from the level spec, so moving a coin or
## reordering the spawns cannot silently wipe a record.
func has_big_coin(level_key: String, coin_id: String) -> bool:
	if coin_id == "":
		return false
	var found: Variant = get_level_record(level_key).get("bigCoins", [])
	return found is Array and (found as Array).has(coin_id)


## Write a finished run into the level's record, keeping the best of the two.
##
## Called at the DOOR and nowhere else. A big coin picked up on a run that ends in
## death does not count, because death reloads the level and the coin comes back
## -- that is the whole shape of a run, and it is why this is not written at
## pickup time.
##
## Element-wise best, never replace: the big coins are unioned and the owl count
## takes the higher. A child who clears a level a second time having found less
## must not lose what they already had.
func bank_run(level_key: String, big_coins: Array, owls_freed: int,
		perfect_run: bool = false) -> void:
	if level_key == "":
		return
	if not (_data.get("levelRecords", null) is Dictionary):
		_data["levelRecords"] = {}
	var records: Dictionary = _data["levelRecords"]
	var record: Dictionary = records.get(level_key, {}) if records.get(level_key, {}) is Dictionary else {}
	var found: Array = record.get("bigCoins", []) if record.get("bigCoins", []) is Array else []
	for id in big_coins:
		var text := String(id)
		if text != "" and not found.has(text):
			found.append(text)
	found.sort()
	record["bigCoins"] = found
	record["owls"] = maxi(int(record.get("owls", 0)), owls_freed)
	# EVERY BIG COIN, IN ONE GO. A separate fact from `bigCoins`, and it has to
	# be, because bigCoins is a union across every visit: a child who finds one
	# coin on each of three runs ends with all three recorded and has never once
	# cleared the level. The union is the right thing to draw on a HUD -- it is
	# what they own -- and it is the wrong thing to put a tick beside.
	#
	# Latched, like everything else in this record: earned once, kept. Losing a
	# tick to a later, lazier visit would make the mark mean "how I did last
	# time", which is not a thing worth going back for.
	record["perfect"] = bool(record.get("perfect", false)) or perfect_run
	records[level_key] = record
	if _auto_save_enabled: save()


## THE COST OF RUNNING OUT OF HEARTS: this level, back to nothing.
##
## Death used to cost the current run and no more. bank_run only ever writes at
## the door, so a run that ended in death banked nothing -- but everything BANKED
## BY EARLIER RUNS survived, and with the level reloading and every coin
## respawning, a child could lose all three hearts and be exactly where they
## started the day. A punishment nobody can feel is not a punishment; it is a
## loading screen.
##
## So the level's record goes. The three big coins have to be found again, the
## owls have to be brought home again -- the whole of THIS PLACE, re-earned.
##
## What deliberately does NOT go, because losing it would punish the wrong thing:
##
##   * completedLevels, so the world stays unlocked and open. A child is never
##     sent backwards through the map for dying, and never re-locked out of
##     somewhere they have already been.
##   * eloStats and learnerState, which are the maths. What a child knows is not
##     a possession the game may take away, and the ELO exists to find their pace
##     rather than to be spent -- see PRODUCT.md.
##
## The owner's decision, 2026-08: "losing progress in that level entirely, keep
## your ELO, and keep that the level was unlocked."
func forget_level_run(level_key: String) -> void:
	if level_key == "":
		return
	var records: Variant = _data.get("levelRecords", null)
	if not (records is Dictionary) or not (records as Dictionary).has(level_key):
		return
	(records as Dictionary).erase(level_key)
	if _auto_save_enabled: save()


## Which tutorials this child has seen: id -> {"skipped": bool, "at": ms}.
##
## A skipped tutorial still counts as seen -- a child who taps Skip has told us
## they do not want it, and re-showing it would make the button a lie. The flag
## is kept rather than discarded so a grown-up surface can tell "was taught" from
## "chose to skip", which are very different facts about a struggling child.
func get_tutorials_seen() -> Dictionary:
	var seen: Variant = _data.get("tutorialsSeen", {})
	return seen if seen is Dictionary else {}

func has_seen_tutorial(tutorial_id: String) -> bool:
	return get_tutorials_seen().has(tutorial_id)

func mark_tutorial_seen(tutorial_id: String, skipped: bool) -> void:
	if tutorial_id == "":
		return
	if not (_data.get("tutorialsSeen", null) is Dictionary):
		_data["tutorialsSeen"] = {}
	(_data["tutorialsSeen"] as Dictionary)[tutorial_id] = {"skipped": skipped, "at": _now_ms()}
	if _auto_save_enabled: save()

func grant_ability(ability_id: String) -> void:
	if not (_data["activeAbilities"] as Array).has(ability_id):
		(_data["activeAbilities"] as Array).append(ability_id)
	if _auto_save_enabled: save()

# --- Auto-save listeners ---

func _register_listeners() -> void:
	EventBus.coins_changed.connect(func(coins): _data["coins"] = coins; if _auto_save_enabled: save())
	EventBus.owl_saved.connect(increment_owls_saved)
	EventBus.level_complete.connect(func(payload): complete_level(String(payload.get("completedLevel", ""))))
	EventBus.ability_granted.connect(func(payload): grant_ability(String(payload.get("abilityId", ""))))
	EventBus.save_game.connect(save)

func _merge(base: Dictionary, over: Dictionary) -> Dictionary:
	var out := base.duplicate(true)
	for k in over:
		out[k] = over[k]
	return out

func _create_default_save() -> Dictionary:
	return {
		"version": SAVE_VERSION,
		"currentLevel": "level_01",
		"completedLevels": [],
		"coins": 0,
		"stars": 0,
		"owlsSaved": 0,
		"xp": 0,
		"playerLevel": 1,
		"inventory": [],
		"activeAbilities": [],
		# level key -> { bigCoins: [id, ...], owls: int }. Best run only, and only
		# written when a level is FINISHED - see Game.transition_to_level.
		"levelRecords": {},
		"mathStats": {"totalCorrect": 0, "totalWrong": 0, "bySkill": {}},
		# `attemptLog` is the grown-up report's per-question list -- see
		# record_math_attempt for why it is kept and why it is kept short.
		"telemetry": {
			"hintUsage": 0, "problemsAttempted": 0, "answeredProblemIds": [], "attemptLog": [],
		},
		# Which concept tutorials this child has already been shown, and whether
		# they sat through it or skipped it. Profile-scoped like everything else
		# here: two children on one device get taught independently.
		"tutorialsSeen": {},
		"settings": {"musicVolume": 0.7, "sfxVolume": 1.0},
		"timestamp": _now_ms(),
	}

func _now_ms() -> int:
	return int(Time.get_unix_time_from_system() * 1000.0)
