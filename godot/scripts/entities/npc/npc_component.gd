extends RefCounted
class_name NpcComponent
## Base for composable NPC behaviors (Godot port of the NPCComponent interface).
## Mirrors NPCFactory composition: an NPC is built from a list of these.

var type := ""
var npc: Node = null  # the Npc node

func init_component(owner_npc: Node) -> void:
	npc = owner_npc

## Take the encounter, and say whether you did.
##
## The return value is what lets npc.gd tell "this owl is busy asking a question"
## from "nothing happened". It used to be void, so an NPC committed to an
## encounter -- flag set, greeting played, prompt hidden -- before knowing whether
## any component would actually open anything, and a component that could not
## left the NPC flagged as mid-encounter with no way back.
func on_interact() -> bool:
	return false

func update_component(_delta: float) -> void:
	pass

func destroy() -> void:
	pass
