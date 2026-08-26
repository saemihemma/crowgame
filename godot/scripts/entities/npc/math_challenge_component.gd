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
# The problem a concept lesson is about, held across the lesson so the child is
# asked the question they were just taught rather than whatever the selector
# would pick a second later.
var _pending_problem: Variant = null

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
	_pending_problem = null
	_launch()

func destroy() -> void:
	if EventBus.math_challenge_complete.is_connected(_on_math_complete):
		EventBus.math_challenge_complete.disconnect(_on_math_complete)
	if EventBus.math_demo_complete.is_connected(_on_demo_complete):
		EventBus.math_demo_complete.disconnect(_on_demo_complete)

func _launch() -> void:
	var game: Node = npc.get_game()
	if game == null or game.is_math_challenge_active() or game.is_math_tutorial_active():
		return
	var config := _selection_config()

	# Teaching window: if this level's gating includes a domain the child has
	# never attempted, the owl demonstrates one worked example first, then
	# hands over a freebie try in the same domain.
	if _pending_freebie_domain == null and _problems_completed == 0:
		for domain in config["domains"]:
			if LearnerStateManager.get_total_attempts(String(domain)) == 0 and not _demo_shown_for.has(domain):
				_demo_shown_for[domain] = true
				# First contact with a whole domain. If the ladder has a lesson
				# for the rung this child starts on, that lesson IS the worked
				# example, and a better one -- it shows the idea with objects and
				# a model before the symbols, and it lets the child try it. The
				# silent demo below stays as the fallback for a rung nobody has
				# written a lesson for yet.
				var opening := ConceptLadder.concept_for(
					String(domain), LearnerStateManager.get_current_step(String(domain)))
				var opening_lesson := TutorialManager.get_tutorial(ConceptLadder.tutorial_id(opening))
				if not opening_lesson.is_empty() and not TutorialManager.has_seen(String(opening_lesson["id"])):
					_pending_freebie_domain = domain
					game.launch_math_tutorial(opening_lesson, _on_tutorial_closed)
					return
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

	# A lesson just finished on a specific problem: ask that one. Re-selecting
	# would hand the child a question from a different rung than the one they
	# were taught, which is most of the value of teaching them gone.
	var problem = _pending_problem
	_pending_problem = null
	if problem == null:
		var prev = _last_domain if _problems_completed > 0 else null
		problem = OwlSelection.select_owl_problem(MathProblemManager, config, prev)
	if problem == null:
		npc.end_interaction()
		return
	_last_domain = problem["domain"]

	# A new rung inside a domain the child already knows. The demo above only
	# ever fires once per domain, so without this the first two-digit sum, the
	# first bridge past ten and the first borrow all arrive with no warning at
	# all -- they are just "addition" and "subtraction" to the runtime.
	if freebie_domain == null:
		var lesson := TutorialManager.tutorial_for_problem(problem)
		if not lesson.is_empty():
			_pending_problem = problem
			_pending_freebie_domain = problem["domain"]
			game.launch_math_tutorial(lesson, _on_tutorial_closed)
			return

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

## A concept lesson ended, whether it was watched or skipped. Either way the
## child now gets the question it was for, as a freebie: a miss on the very
## first try at a brand-new idea records nothing at all.
func _on_tutorial_closed(payload: Dictionary) -> void:
	TutorialManager.mark_seen(String(payload.get("tutorialId", "")), bool(payload.get("skipped", false)))
	if npc == null or not is_instance_valid(npc) or not npc.is_interacting():
		# The encounter ended under the lesson (the level reloaded, the player
		# died). The held problem is never going to be asked, so hand its
		# selection metadata back rather than leaving an orphan in the pool
		# manager's map -- the demo path does the same for the same reason.
		if _pending_problem != null:
			MathProblemManager.consume_selection_meta(String((_pending_problem as Dictionary).get("id", "")))
			_pending_problem = null
		return
	npc.get_tree().create_timer(0.22).timeout.connect(_launch_next, CONNECT_ONE_SHOT)

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
	return {
		"domains": allowed,
		"difficultyRange": effective_range,
		"maxCurriculumStep": maxi(0, int(round(float(effective_range[1]) * 10.0))),
		# THE AGE BAND, AS A NUMBER. Do not raise this to unlock content.
		#
		# Horman teaches 5-7 year olds, and the Icelandic first-year curriculum
		# works inside 0-20: number sense, writing the numerals 0-20, and meeting
		# addition and subtraction within that range. Twenty is that boundary,
		# not a placeholder.
		#
		# It is load-bearing in a way that is easy to miss. Every problem from
		# addition step 20 and subtraction step 17 upward has an operand above
		# 20, so this one number decides whether four whole concepts --
		# addition.tens_and_ones, addition.carrying, subtraction.tens_and_ones,
		# subtraction.borrowing, 1024 authored problems and four lessons -- are
		# reachable at all. They are declared in `knownUnreachable` in
		# data/curriculum/concept_ladder.json, and
		# tools/validate_math_concepts.mjs reads THIS LINE to check that
		# declaration: change the number and the build tells you what you just
		# handed a six-year-old.
		#
		# Raising it is a product decision about who the game is for, not a
		# content unlock. MATH_SYSTEM_ARCHITECTURE.md and
		# docs/MATH_CONCEPT_LADDER.md both carry the reasoning.
		"maxOperand": 20,
		"primaryDomain": allowed[0],
		# How often each subject comes due. Data, so "how much addition does a
		# child meet" is a designer's dial rather than an accident of the order
		# problemTypes happens to list.
		"domainWeights": DataManager.get_dict("MATH_TUNING").get("domainWeights", {}),
	}
