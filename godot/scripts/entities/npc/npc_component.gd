extends RefCounted
class_name NpcComponent
## Base for composable NPC behaviors (Godot port of the NPCComponent interface).
## Mirrors NPCFactory composition: an NPC is built from a list of these.

var type := ""
var npc: Node = null  # the Npc node

func init_component(owner_npc: Node) -> void:
	npc = owner_npc

func on_interact() -> void:
	pass

func update_component(_delta: float) -> void:
	pass

func destroy() -> void:
	pass
