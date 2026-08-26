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
# Teaching window: which domain the current interact's freebie belongs to. The
# question after a lesson is a freebie -- a miss on the very first try at a
# brand-new idea records nothing at all.
var _pending_freebie_domain: Variant = null
## At most one lesson per owl. Teaching is per-concept and selection is per
## problem, so an owl that asked two questions could open two lessons back to
## back -- and even a one-question owl re-enters _launch() after a lesson, which
## is the shape a second one would arrive through. One interruption per owl is
## the budget: the child came here to answer a question.
var _taught_this_encounter := false
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

func on_interact() -> bool:
	_problems_completed = 0
	_last_domain = null
	_pending_freebie_domain = null
	_pending_problem = null
	_taught_this_encounter = false
	return _launch()

func destroy() -> void:
	if EventBus.math_challenge_complete.is_connected(_on_math_complete):
		EventBus.math_challenge_complete.disconnect(_on_math_complete)

## Open the next thing this encounter owes the child -- a lesson, or a question.
## Returns whether anything opened, which is what npc.gd needs in order to decide
## whether an encounter has actually begun (see Npc.interact).
func _launch() -> bool:
	var game: Node = npc.get_game()
	if game == null or game.is_math_challenge_active() or game.is_math_tutorial_active():
		# Another board is already on screen, or there is no level to host one.
		# Nothing opens, and saying so is the whole point: this used to `return`
		# bare, and because npc.gd had already committed the encounter, the owl
		# stayed flagged mid-encounter for the rest of the level -- prompt hidden,
		# re-trigger loop skipping it, completion events ignored. It went
		# permanently quiet and standing on it did nothing, which is the report.
		return false
	var config := _selection_config()

	# FIRST CONTACT WITH A DOMAIN. The child has never attempted this subject, so
	# the opening rung's lesson runs before the first question and that question
	# is a freebie.
	#
	# There used to be a second, wordless mechanism here: the owl presented a
	# problem it answered itself while the child watched, on a fixed four-beat
	# timer, and only fell back to it when the rung had no authored lesson. Forty
	# seven lessons now cover every domain's opening rung, so the fallback was
	# unreachable in every journey the simulator produces -- and it was the last
	# thing that could make one owl more than [one lesson] -> one question. The
	# lesson is the better worked example anyway: it shows the idea with objects
	# and a model before the symbols, and it lets the child try it.
	if _pending_freebie_domain == null and _problems_completed == 0 and not _taught_this_encounter:
		for domain in config["domains"]:
			if LearnerStateManager.get_total_attempts(String(domain)) > 0:
				continue
			var opening := ConceptLadder.concept_for(
				String(domain), LearnerStateManager.get_current_step(String(domain)))
			var opening_lesson := TutorialManager.get_tutorial(ConceptLadder.tutorial_id(opening))
			if opening_lesson.is_empty() or TutorialManager.has_seen(String(opening_lesson["id"])):
				continue
			_pending_freebie_domain = domain
			_taught_this_encounter = true
			game.launch_math_tutorial(opening_lesson, _on_tutorial_closed,
				TutorialManager.depth_for(String(opening_lesson["id"])))
			return true

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
		return false
	_last_domain = problem["domain"]

	# A new rung inside a domain the child already knows. First contact above only
	# ever fires once per domain, so without this the first two-digit sum, the
	# first bridge past ten and the first borrow all arrive with no warning at
	# all -- they are just "addition" and "subtraction" to the runtime.
	if freebie_domain == null and not _taught_this_encounter:
		var lesson := TutorialManager.tutorial_for_problem(problem)
		if not lesson.is_empty():
			_taught_this_encounter = true
			_pending_problem = problem
			_pending_freebie_domain = problem["domain"]
			# FULL the first time this child is taught anything in this domain,
			# BRIEF for every rung after that (TutorialManager.depth_for).
			game.launch_math_tutorial(lesson, _on_tutorial_closed,
				TutorialManager.depth_for(String(lesson.get("id", ""))))
			return true

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
	return true

## A concept lesson ended, whether it was watched or skipped. Either way the
## child now gets the question it was for, as a freebie: a miss on the very
## first try at a brand-new idea records nothing at all.
func _on_tutorial_closed(payload: Dictionary) -> void:
	TutorialManager.mark_seen(String(payload.get("tutorialId", "")), bool(payload.get("skipped", false)))
	if npc == null or not is_instance_valid(npc) or not npc.is_interacting():
		# The encounter ended under the lesson (the level reloaded, the player
		# died). The held problem is never going to be asked, so hand its
		# selection metadata back rather than leaving an orphan in the pool
		# manager's map.
		if _pending_problem != null:
			MathProblemManager.consume_selection_meta(String((_pending_problem as Dictionary).get("id", "")))
			_pending_problem = null
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

## Continue a live encounter. Unlike the opening _launch(), the encounter is
## already committed here, so a launch that opens nothing has to END it rather
## than decline it -- otherwise the owl is left mid-encounter with no board.
func _launch_next() -> void:
	if npc == null or not is_instance_valid(npc) or not npc.is_interacting():
		return
	if not _launch():
		npc.end_interaction()

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
	var config_out := {
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
		# content unlock. docs/MATH_CONCEPT_LADDER.md carries the reasoning.
		"maxOperand": 20,
		"primaryDomain": allowed[0],
		# How often each subject comes due. Data, so "how much addition does a
		# child meet" is a designer's dial rather than an accident of the order
		# problemTypes happens to list.
		"domainWeights": DataManager.get_dict("MATH_TUNING").get("domainWeights", {}),
		# Whether a subject the child has finished stops coming round. See
		# feature_flags.json, and OwlSelection.get_allowed_owl_domains for what it
		# actually does.
		"retireExhaustedDomains": bool(Config.flag("math/retire_exhausted_domains", true)),
	}
	# The representation floor. Resolved HERE rather than in the selector because
	# it takes a curriculum question -- can this child compose a ten yet? -- and
	# the selector deals in caps it has already been handed, like maxOperand above.
	var floor_cap: Variant = _ungrouped_count_cap()
	if floor_cap != null:
		config_out["maxUngroupedCount"] = floor_cap
	return config_out

## The largest quantity this child may still be asked to count one at a time, or
## null for no cap.
##
## Switches on at the first rung of `addition.teen_numbers` -- the lesson that
## says thirteen is one ten and three ones. Before it, counting fourteen marks is
## honest work; after it, the same question asks the child to do by ones the exact
## thing they were just taught to stop doing, which is the contradiction a
## playtester reported as being told "again, to count amount of dots".
##
## The rung is read from the ladder rather than written down, so re-banding
## concept_ladder.json moves the floor with it.
const UNGROUPED_COUNT_CEILING := 10

func _ungrouped_count_cap() -> Variant:
	if not bool(Config.flag("math/representation_floor", true)):
		return null
	var teen: Dictionary = ConceptLadder.by_id("addition.teen_numbers")
	var steps: Variant = teen.get("steps", null)
	if not (steps is Array) or (steps as Array).is_empty():
		return null
	if LearnerStateManager.get_current_step("addition") < int((steps as Array)[0]):
		return null
	return UNGROUPED_COUNT_CEILING
