extends Node
## ELOManager — Godot port of src/math/ELOManager.ts. Autoload.
##
## Tier-1 exact port. Stats are held as a Dictionary matching PlayerELOStats so
## the save shape is identical. All constants/formulas mirror the TS source:
##   start 150; effective = global + domainModifier;
##   expected = 1/(1+10^((problemELO - playerELO)/400));
##   K = 4 (<50), 3 (<200), else 2; rawChange = K*(actual-expected);
##   totalChange clamped to [-12, +8]; split 0.7 global / 0.3 domain;
##   global clamp [100,1200], domain modifier clamp [-100,+100].

const DOMAINS := ["addition", "subtraction", "multiplication", "division", "counting", "comparison", "pattern_matching", "number_sequence"]

var _stats: Dictionary = {}

func _ready() -> void:
	# Initialize from save if present, else defaults (matches BootScene order).
	var save := get_node_or_null("/root/SaveManager")
	var elo_stats: Variant = save.get_data().get("eloStats", null) if save != null else null
	initialize(elo_stats)

func initialize(save_data: Variant) -> void:
	if save_data is Dictionary and not save_data.is_empty():
		_stats = _normalize_stats(save_data)
	else:
		_stats = create_default_stats()

static func create_default_stats() -> Dictionary:
	return {
		"globalELO": 150.0,
		"domainModifiers": {
			"addition": 0.0, "subtraction": 0.0, "multiplication": 0.0, "division": 0.0,
			"counting": 0.0, "comparison": 0.0, "pattern_matching": 0.0, "number_sequence": 0.0,
		},
		"problemsAttempted": 0,
		"lastUpdated": int(Time.get_unix_time_from_system() * 1000.0),
	}

func _calculate_expected_score(player_elo: float, problem_elo: float) -> float:
	return 1.0 / (1.0 + pow(10.0, (problem_elo - player_elo) / 400.0))

func _get_k_factor(problems_attempted: int) -> int:
	if problems_attempted < 50:
		return 4
	if problems_attempted < 200:
		return 3
	return 2

func update_rating(domain: String, problem_elo: float, actual_score: float) -> Dictionary:
	var effective_elo := get_effective_elo(domain)
	var expected := _calculate_expected_score(effective_elo, problem_elo)
	var k := _get_k_factor(int(_stats["problemsAttempted"]))
	var raw_change := k * (actual_score - expected)
	var total_change: float = maxf(-12.0, minf(8.0, raw_change))

	var global_change := total_change * 0.7
	var domain_change := total_change * 0.3

	_stats["globalELO"] = maxf(100.0, minf(1200.0, float(_stats["globalELO"]) + global_change))
	var mods: Dictionary = _stats["domainModifiers"]
	mods[domain] = maxf(-100.0, minf(100.0, float(mods[domain]) + domain_change))

	_stats["problemsAttempted"] = int(_stats["problemsAttempted"]) + 1
	_stats["lastUpdated"] = int(Time.get_unix_time_from_system() * 1000.0)

	return {
		"newGlobalELO": _stats["globalELO"],
		"newDomainModifier": mods[domain],
		"change": total_change,
		"expectedScore": expected,
	}

func get_effective_elo(domain: String) -> float:
	return float(_stats["globalELO"]) + float(_stats["domainModifiers"][domain])

func get_stats() -> Dictionary:
	return _stats

func get_global_elo() -> float:
	return float(_stats["globalELO"])

func get_domain_modifier(domain: String) -> float:
	return float(_stats["domainModifiers"][domain])

func get_problems_attempted() -> int:
	return int(_stats["problemsAttempted"])

func _normalize_stats(raw: Dictionary) -> Dictionary:
	var defaults := create_default_stats()
	var out := defaults.duplicate(true)
	out["globalELO"] = float(raw.get("globalELO", defaults["globalELO"]))
	out["problemsAttempted"] = int(raw.get("problemsAttempted", 0))
	out["lastUpdated"] = int(raw.get("lastUpdated", defaults["lastUpdated"]))
	var raw_mods: Dictionary = raw.get("domainModifiers", {})
	for d in DOMAINS:
		out["domainModifiers"][d] = float(raw_mods.get(d, 0.0))
	return out
