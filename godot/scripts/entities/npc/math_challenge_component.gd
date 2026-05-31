extends NpcComponent
class_name MathChallengeComponent
## Port of MathChallengeComponent: the owl flow. On interaction, presents up to
## `problem_count` problems (owl-selected). Correct -> next problem; on the final
## correct -> owl_saved; any encounter end -> end interaction + fly away.

var problem_types: Array = []
var difficulty_range: Array = [1, 2]
var problem_count := 2

var _problems_completed := 0
var _last_domain: Variant = null

func _init(config: Dictionary = {}) -> void:
	type = "math_challenge"
	problem_types = config.get("problemTypes", [])
	difficulty_range = config.get("difficultyRange", [1, 2])
	problem_count = int(config.get("problemCount", 2))

func init_component(owner_npc: Node) -> void:
	npc = owner_npc
	EventBus.math_challenge_complete.connect(_on_math_complete)

func on_interact() -> void:
	_problems_completed = 0
	_last_domain = null
	_launch()

func destroy() -> void:
	if EventBus.math_challenge_complete.is_connected(_on_math_complete):
		EventBus.math_challenge_complete.disconnect(_on_math_complete)

func _launch() -> void:
	var game: Node = npc.get_game()
	if game == null or game.is_math_challenge_active():
		return
	var config := _selection_config()
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

	game.launch_math_challenge(problem, {
		"coinsReward": reward_for_this,
		"npcName": TextManager.t("npc.professor_hoot"),
		"npcGreeting": greeting,
		"currentProblemIndex": _problems_completed + 1,
		"problemCount": problem_count,
	})

func _on_math_complete(data: Dictionary) -> void:
	if npc == null or not npc.is_interacting():
		return
	if data.get("correct", false):
		_problems_completed += 1
		if _problems_completed < problem_count:
			npc.get_tree().create_timer(0.22).timeout.connect(func():
				if npc != null and npc.is_interacting():
					_launch(), CONNECT_ONE_SHOT)
			return
		EventBus.owl_saved.emit()
	npc.end_interaction()
	npc.fly_away()

func _selection_config() -> Dictionary:
	var configured := problem_types.duplicate()
	var allowed: Array = []
	for d in configured:
		if LearnerStateManager.is_domain_unlocked(String(d)):
			allowed.append(d)
	if allowed.is_empty():
		allowed = ["addition"] if configured.has("addition") else [configured[0]]
	return {
		"domains": allowed,
		"difficultyRange": difficulty_range,
		"maxCurriculumStep": maxi(0, int(round(float(difficulty_range[1]) * 10.0))),
		"maxOperand": 20,
		"primaryDomain": allowed[0],
	}
