extends Node
## SessionStats — ported from the retired Phaser build; this is now the only
## implementation. Autoload.
##
## Counts the good things that happened during a play session (from leaving
## the menu until coming back) so the main menu can greet the child with a
## recap that follows the peak-end rule: end on the best moment. Only
## positive counts exist here — nothing can ever render as a negative stat.

var _stats := _empty()

func _ready() -> void:
	EventBus.owl_saved.connect(func(): _stats["owlsSaved"] += 1)
	EventBus.math_challenge_complete.connect(_on_math_complete)
	EventBus.curriculum_step_up.connect(func(_p): _stats["stepUps"] += 1)
	EventBus.math_comeback.connect(func(_p): _stats["comebacks"] += 1)

func _on_math_complete(payload: Dictionary) -> void:
	if bool(payload.get("correct", false)):
		_stats["problemsSolved"] += 1
		if bool(payload.get("golden", false)):
			_stats["goldenWins"] += 1

## The recap worth showing, or empty when the session had nothing to
## celebrate (never show an empty or shaming screen). Consuming resets the
## counters, so a recap shows exactly once.
func consume() -> Dictionary:
	var recap := _stats
	_stats = _empty()
	if int(recap["problemsSolved"]) > 0 or int(recap["owlsSaved"]) > 0:
		return recap
	return {}

func reset() -> void:
	_stats = _empty()

func _empty() -> Dictionary:
	return {"owlsSaved": 0, "problemsSolved": 0, "stepUps": 0, "comebacks": 0, "goldenWins": 0}
