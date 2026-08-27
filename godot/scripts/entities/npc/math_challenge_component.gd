extends NpcComponent
class_name MathChallengeComponent
## Port of MathChallengeComponent: the owl flow. On interaction, presents up to
## `problem_count` problems (owl-selected). Correct -> next problem; on the final
## correct -> owl_saved; any encounter end -> end interaction + fly away.
## Baseline owl asks 1 problem; problem_count stays per-NPC config so a future
## gated variant (e.g. a padlock owl) can demand more.

var problem_types: Array = []
var difficulty_range: Array = [1, 3]
var problem_count := 1

var _problems_completed := 0
var _last_domain: Variant = null
# Teaching window: which domain the current interact's freebie belongs to,
# and which domains already got their demo this session.
var _pending_freebie_domain: Variant = null
static var _demo_shown_for: Dictionary = {}

func _init(config: Dictionary = {}) -> void:
	type = "math_challenge"
	problem_types = config.get("problemTypes", [])
	difficulty_range = config.get("difficultyRange", [1, 3])
	problem_count = int(config.get("problemCount", 1))

func init_component(owner_npc: Node) -> void:
	npc = owner_npc
	EventBus.math_challenge_complete.connect(_on_math_complete)
	EventBus.math_demo_complete.connect(_on_demo_complete)

func on_interact() -> void:
	_problems_completed = 0
	_last_domain = null
	_pending_freebie_domain = null
	_launch()

func destroy() -> void:
	if EventBus.math_challenge_complete.is_connected(_on_math_complete):
		EventBus.math_challenge_complete.disconnect(_on_math_complete)
	if EventBus.math_demo_complete.is_connected(_on_demo_complete):
		EventBus.math_demo_complete.disconnect(_on_demo_complete)

func _launch() -> void:
	var game: Node = npc.get_game()
	if game == null or game.is_math_challenge_active():
		return
	var config := _selection_config()

	# Teaching window: if this level's gating includes a domain the child has
	# never attempted, the owl demonstrates one worked example first, then
	# hands over a freebie try in the same domain.
	if _pending_freebie_domain == null and _problems_completed == 0:
		for domain in config["domains"]:
			if LearnerStateManager.get_total_attempts(String(domain)) == 0 and not _demo_shown_for.has(domain):
				_demo_shown_for[domain] = true
				var demo_config := config.duplicate(true)
				demo_config["domains"] = [domain]
				demo_config["primaryDomain"] = domain
				var demo_problem = OwlSelection.select_owl_problem(MathProblemManager, demo_config, null)
				if demo_problem != null:
					MathProblemManager.consume_selection_meta(String(demo_problem.get("id", "")))
					_pending_freebie_domain = domain
					game.launch_math_challenge(demo_problem, {
						"demo": true,
						"npcName": TextManager.t("npc.professor_hoot"),
						"npcGreeting": TextManager.t("math.demo_watch"),
					})
					return
				break

	var freebie_domain = _pending_freebie_domain
	_pending_freebie_domain = null
	if freebie_domain != null:
		config = config.duplicate(true)
		config["domains"] = [freebie_domain]
		config["primaryDomain"] = freebie_domain

	var prev = _last_domain if _problems_completed > 0 else null
	var problem = OwlSelection.select_owl_problem(MathProblemManager, config, prev)
	if problem == null:
		npc.end_interaction()
		return
	_last_domain = problem["domain"]

	var reward_amount := int(npc.reward_amount)
	var reward_for_this := reward_amount if _problems_completed + 1 >= problem_count else 0
	var greeting_keys := ["math.greeting_1", "math.greeting_2", "math.greeting_3", "math.greeting_4", "math.greeting_5"]
	var greeting := TextManager.t(greeting_keys[randi() % greeting_keys.size()])
	if freebie_domain != null:
		greeting = TextManager.t("math.demo_your_turn")

	# Golden problems: a seeded roll on (childId, lifetime attempt index) at
	# the tuned rate. Never during the teaching window — first contact with
	# new math stays calm.
	var golden_rate := float((DataManager.get_dict("MATH_TUNING").get("golden", {}) as Dictionary).get("rate", 0.0))
	var golden: bool = freebie_domain == null and GoldenRoll.is_golden_encounter(
		String(LearnerStateManager.get_snapshot().get("childId", "local-child")),
		LearnerStateManager.get_lifetime_attempt_count(),
		golden_rate,
	)

	game.launch_math_challenge(problem, {
		"coinsReward": reward_for_this,
		"npcName": TextManager.t("npc.professor_hoot"),
		"npcGreeting": greeting,
		"currentProblemIndex": _problems_completed + 1,
		"problemCount": problem_count,
		"freebie": freebie_domain != null,
		"golden": golden,
	})

func _on_demo_complete(_data: Dictionary) -> void:
	if npc == null or not npc.is_interacting() or _pending_freebie_domain == null:
		return
	npc.get_tree().create_timer(0.22).timeout.connect(_launch_next, CONNECT_ONE_SHOT)

func _on_math_complete(data: Dictionary) -> void:
	if npc == null or not npc.is_interacting():
		return
	if data.get("correct", false):
		_problems_completed += 1
		if _problems_completed < problem_count:
			npc.get_tree().create_timer(0.22).timeout.connect(_launch_next, CONNECT_ONE_SHOT)
			return
		EventBus.owl_saved.emit()
	npc.end_interaction()
	npc.fly_away()

func _launch_next() -> void:
	if npc != null and is_instance_valid(npc) and npc.is_interacting():
		_launch()

func _selection_config() -> Dictionary:
	var configured := problem_types.duplicate()
	var effective_range := difficulty_range.duplicate()

	# The level's mathGating decides which math this place teaches; the NPC
	# config is the superset it may draw from. An empty intersection falls
	# back to the NPC config so a mis-authored level never bricks. The band
	# is the intersection of the NPC's and the level's; the curriculum ladder
	# still owns how hard within it. The LEVEL's skill order survives the
	# intersection: its first skill is the headline with the 70% primary share.
	var level: Variant = LevelManager.get_current_level()
	if level is Dictionary and level.get("mathGating", null) is Dictionary:
		var gating: Dictionary = level["mathGating"]
		var gated_skills: Array = gating.get("skills", [])
		if not gated_skills.is_empty():
			var gated: Array = []
			for d in gated_skills:
				if configured.has(d):
					gated.append(d)
			if not gated.is_empty():
				configured = gated
		var band: Array = gating.get("difficultyBand", [])
		if band.size() == 2:
			var lo: float = maxf(float(effective_range[0]), float(band[0]))
			var hi: float = minf(float(effective_range[1]), float(band[1]))
			if lo <= hi:
				effective_range = [lo, hi]

	var allowed: Array = []
	for d in configured:
		if LearnerStateManager.is_domain_unlocked(String(d)):
			allowed.append(d)
	if allowed.is_empty():
		allowed = ["addition"] if configured.has("addition") else [configured[0]]
	# No maxOperand rail here, deliberately. It was a fossil from when all
	# content lived under 20: it silently filtered out every problem with an
	# operand above 20, so a perfect player froze at sums of ~20 forever and
	# promotion stalled with no reachable content above (proved by the kernel
	# perfect-player simulation, 2026-08). Difficulty is governed by the
	# curriculum step gate (the child's own pace), the level's difficultyBand
	# (this place's identity), and problem ELO — three fences is enough.
	return {
		"domains": allowed,
		"difficultyRange": effective_range,
		"maxCurriculumStep": maxi(0, int(round(float(effective_range[1]) * 10.0))),
		"primaryDomain": allowed[0],
	}
