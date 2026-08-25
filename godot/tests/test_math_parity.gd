extends TestCase
## Tier-1 parity: replays the golden fixtures generated from the REAL TS source
## (tools/golden/gen_math_fixtures.ts) through the GDScript port and asserts
## identical outputs — ELO deltas/clamps/splits/K-tiers, problem-ELO mapping,
## replay keys, confidence decay, promotion/demotion, and review SRS scheduling.

const FIX_PATH := "res://tests/fixtures/math_fixtures.json"
const ELO_TOL := 1e-6  # float tolerance: pow()/libm may differ by <1 ULP across engines.

var _fix: Dictionary = {}

	if _fix.is_empty():
		var f := FileAccess.open(FIX_PATH, FileAccess.READ)
		_fix = JSON.parse_string(f.get_as_text())
		f.close()

func _elo() -> Node:
	return Engine.get_main_loop().root.get_node("ELOManager")

func _lsm() -> Node:
	return Engine.get_main_loop().root.get_node("LearnerStateManager")

func _make_stats(init: Dictionary) -> Dictionary:
	var s: Dictionary = _elo().create_default_stats()
	s["globalELO"] = float(init.get("globalELO", s["globalELO"]))
	s["problemsAttempted"] = int(init.get("problemsAttempted", 0))
	for d in init.get("domainModifiers", {}):
		s["domainModifiers"][d] = float(init["domainModifiers"][d])
	return s

func test_elo_update_parity() -> void:
	for sc in _fix["elo"]:
		_elo().initialize(_make_stats(sc["init"]))
		var updates: Array = sc["updates"]
		var per: Array = sc["perUpdate"]
		for i in updates.size():
			var u: Dictionary = updates[i]
			var r: Dictionary = _elo().update_rating(String(u["domain"]), float(u["problemELO"]), float(u["actualScore"]))
			var e: Dictionary = per[i]
			assert_almost_eq(r["change"], float(e["change"]), ELO_TOL, "%s u%d change" % [sc["name"], i])
			assert_almost_eq(r["expectedScore"], float(e["expectedScore"]), ELO_TOL, "%s u%d expected" % [sc["name"], i])
			assert_almost_eq(r["newGlobalELO"], float(e["newGlobalELO"]), ELO_TOL, "%s u%d global" % [sc["name"], i])
			assert_almost_eq(r["newDomainModifier"], float(e["newDomainModifier"]), ELO_TOL, "%s u%d domainMod" % [sc["name"], i])
		var fin: Dictionary = sc["final"]
		assert_almost_eq(_elo().get_global_elo(), float(fin["globalELO"]), ELO_TOL, "%s final global" % sc["name"])
		assert_eq(_elo().get_problems_attempted(), int(fin["problemsAttempted"]), "%s final attempts" % sc["name"])
		for d in fin["domainModifiers"]:
			assert_almost_eq(_elo().get_domain_modifier(d), float(fin["domainModifiers"][d]), ELO_TOL, "%s mod %s" % [sc["name"], d])

func test_problem_elo_parity() -> void:
	var pool := ProblemPoolManager.new()
	var problems: Array = []
	var cases: Array = _fix["problemELO"]
	for i in cases.size():
		problems.append({"id": "pe_%d" % i, "domain": "addition", "skills": ["add"],
			"difficulty": float(cases[i]["difficulty"]), "curriculumStep": 0,
			"prompt": {"text": "%d + %d" % [i, i]}, "answer": {"correct": i + i}})
	pool.initialize(problems)
	for i in cases.size():
		assert_eq(pool.get_problem_elo("pe_%d" % i), int(cases[i]["elo"]), "problemELO d=%s" % str(cases[i]["difficulty"]))

func test_replay_key_parity() -> void:
	for c in _fix["replayKeys"]:
		var key := ProblemReplayKey.build(c["problem"])
		assert_eq(key, String(c["key"]), "replay key for %s" % c["problem"]["prompt"]["text"])

func test_golden_roll_parity() -> void:
	# The seeded golden coin flip must land identically in both ports: the
	# fixtures carry the TS draw for (childId, attemptIndex) and the verdict
	# at the tuned rate; GoldenRoll must reproduce both exactly.
	var rate := float((DataManager.get_dict("MATH_TUNING").get("golden", {}) as Dictionary).get("rate", 0.0))
	assert_true((_fix.get("goldenRolls", []) as Array).size() > 0, "goldenRolls fixtures present")
	for fx in _fix.get("goldenRolls", []):
		var child_id := String(fx["childId"])
		var idx := int(fx["attemptIndex"])
		var draw := GoldenRoll.golden_draw(child_id, idx)
		assert_true(absf(draw - float(fx["draw"])) < 1e-12, "golden draw %s:%d (got %.15f want %.15f)" % [child_id, idx, draw, float(fx["draw"])])
		assert_eq(GoldenRoll.is_golden_encounter(child_id, idx, rate), bool(fx["goldenAtRate"]), "golden verdict %s:%d" % [child_id, idx])

func test_learner_parity() -> void:
	# The fixtures exercise the pure learner state machine. The runtime
	# autoloads wire a pool-backed step-content provider (which reconciles
	# curriculum floors against the real problem pools), so neutralize it here
	# to match the providerless TS fixture generator.
	_lsm().set_step_content_provider(Callable())
	for sc in _fix["learner"]:
		_elo().initialize(_make_stats(sc.get("eloInit", {})))
		_lsm().initialize({"childId": "c", "familyId": "f"}, null, _elo().get_stats())
		for a in sc["attempts"]:
			var review_item_id: Variant = a.get("reviewItemId", null)
			if review_item_id == "@existing":
				review_item_id = _resolve_existing(String(a["domain"]), String(a["skills"][0]))
			var submission: Dictionary = a.duplicate(true)
			submission["reviewItemId"] = review_item_id
			_lsm().record_attempt(submission)

		var snap: Dictionary = _lsm().get_snapshot()
		var exp: Dictionary = sc["expected"]
		for d in exp["confidenceOffsets"]:
			assert_almost_eq(float(snap["confidenceOffsets"][d]), float(exp["confidenceOffsets"][d]), 1e-9, "%s conf %s" % [sc["name"], d])
		for d in exp["curriculum"]:
			assert_eq(int(snap["curriculumProgress"][d]["currentStep"]), int(exp["curriculum"][d]["currentStep"]), "%s step %s" % [sc["name"], d])
			assert_eq(int(snap["curriculumProgress"][d]["winsAtCurrentStep"]), int(exp["curriculum"][d]["winsAtCurrentStep"]), "%s wins %s" % [sc["name"], d])
		for d in exp["unlockState"]:
			assert_eq(bool(snap["unlockState"].get(d, false)), bool(exp["unlockState"][d]), "%s unlock %s" % [sc["name"], d])
		assert_eq(snap["recentProblemIds"].size(), (exp["recentProblemIds"] as Array).size(), "%s recentIds len" % sc["name"])
		_assert_review_items(sc["name"], snap["reviewItems"], exp["reviewItems"])

func _assert_review_items(name: String, actual: Array, expected: Array) -> void:
	assert_eq(actual.size(), expected.size(), "%s review count" % name)
	var norm := _normalize_reviews(actual)
	for i in mini(norm.size(), expected.size()):
		var a: Dictionary = norm[i]
		var e: Dictionary = expected[i]
		assert_eq(a["skill"], String(e["skill"]), "%s review[%d] skill" % [name, i])
		assert_eq(a["domain"], String(e["domain"]), "%s review[%d] domain" % [name, i])
		assert_eq(a["stage"], String(e["stage"]), "%s review[%d] stage" % [name, i])
		assert_eq(a["successfulReviews"], int(e["successfulReviews"]), "%s review[%d] successes" % [name, i])
		# dueAt is deterministic (answeredAt + fixed offset); compare exactly.
		if e["dueAt"] == null:
			assert_true(a["dueAt"] == null, "%s review[%d] dueAt null" % [name, i])
		else:
			assert_eq(int(a["dueAt"]), int(e["dueAt"]), "%s review[%d] dueAt" % [name, i])
		# dueAfterAttempt uses an intentionally-random gap; only check presence + range.
		assert_eq(a["dueAfterAttemptSet"], bool(e["dueAfterAttemptSet"]), "%s review[%d] dueAfter set" % [name, i])
		if a["dueAfterAttemptSet"]:
			var g: int = int(a["dueAfterAttempt"])
			assert_true(g >= 2 and g <= 4, "%s review[%d] gap in [2,4] (got %d)" % [name, i, g])

func _normalize_reviews(items: Array) -> Array:
	var out: Array = []
	for it in items:
		out.append({
			"skill": it["skill"], "domain": it["domain"], "stage": it["stage"],
			"successfulReviews": it["successfulReviews"],
			"dueAt": it.get("dueAt", null),
			"dueAfterAttemptSet": it.get("dueAfterAttempt", null) != null,
			"dueAfterAttempt": it.get("dueAfterAttempt", null),
		})
	out.sort_custom(func(a, b): return (a["domain"] + a["skill"] + a["stage"]) < (b["domain"] + b["skill"] + b["stage"]))
	return out

func _resolve_existing(domain: String, skill: String) -> Variant:
	var snap: Dictionary = _lsm().get_snapshot()
	for it in snap["reviewItems"]:
		if it["domain"] == domain and it["skill"] == skill and it["stage"] != "graduated":
			return it["id"]
	return null
