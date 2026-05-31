extends NpcComponent
class_name InteractableComponent
## Port of InteractableComponent: emits npc_interact on interaction.

func _init() -> void:
	type = "interactable"

func on_interact() -> void:
	EventBus.npc_interact.emit({"npcId": npc.npc_id, "name": npc.display_name})
