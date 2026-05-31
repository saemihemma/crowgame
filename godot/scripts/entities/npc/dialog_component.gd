extends NpcComponent
class_name DialogComponent
## Port of DialogComponent. The owl's greeting/success/failure lines are shown
## inside the MathChallenge overlay header, so here we hold the i18n keys and
## emit dialog_start/end signals. (A standalone DialogBox can hang off these
## signals later without changing the NPC.)

var greeting_key := ""
var success_key := ""
var failure_key := ""

func _init(config: Dictionary = {}) -> void:
	type = "dialog"
	greeting_key = String(config.get("greeting", ""))
	success_key = String(config.get("success", ""))
	failure_key = String(config.get("failure", ""))

func on_interact() -> void:
	EventBus.dialog_start.emit({"npcId": npc.npc_id, "greeting": greeting_key})
