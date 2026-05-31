extends Node2D
## Npc — composition-based NPC (Godot port of BaseNPC + NPCFactory).
## Loads its definition from npc_registry by id, builds components, and triggers
## interaction when the player enters the 96x96 zone (cooldown-guarded). Flies
## away when its encounter completes.

@export var npc_id := ""

var definition: Dictionary = {}
var display_name := ""
var reward_amount := 1
var _components: Array = []
var _interacting := false
var _cooldown_until := 0
var _flown := false

@onready var _sprite: Sprite2D = $Sprite
@onready var _zone: Area2D = $InteractZone

func _ready() -> void:
	add_to_group("npc")
	definition = _lookup_definition(npc_id)
	display_name = String(definition.get("name", "NPC"))
	reward_amount = int(definition.get("behaviorConfig", {}).get("rewardAmount", 1))
	var sheet := String(definition.get("spritesheet", "assets/sprites/characters/npcs/owl-runtime-64.png"))
	var tex_path := "res://%s" % sheet
	if ResourceLoader.exists(tex_path):
		_sprite.texture = load(tex_path)
	_build_components(definition.get("components", []))
	_zone.body_entered.connect(_on_body_entered)

func _process(delta: float) -> void:
	for c in _components:
		c.update_component(delta)

func _on_body_entered(body: Node) -> void:
	if body.is_in_group("player"):
		interact()

func interact() -> void:
	if _interacting or _flown:
		return
	if Time.get_ticks_msec() < _cooldown_until:
		return
	_interacting = true
	for c in _components:
		c.on_interact()

func end_interaction() -> void:
	_interacting = false
	_cooldown_until = Time.get_ticks_msec() + 2000

func is_interacting() -> bool:
	return _interacting

func fly_away() -> void:
	if _flown:
		return
	_flown = true
	_zone.monitoring = false
	var tw := create_tween().set_parallel(true)
	tw.tween_property(_sprite, "position:y", _sprite.position.y - 400.0, 0.8).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.tween_property(_sprite, "modulate:a", 0.0, 0.8)
	tw.chain().tween_callback(queue_free)

func get_game() -> Node:
	var n := get_parent()
	while n != null:
		if n.has_method("launch_math_challenge"):
			return n
		n = n.get_parent()
	return null

func _build_components(defs: Array) -> void:
	for d in defs:
		var t := String(d.get("type", ""))
		var comp: NpcComponent = null
		match t:
			"interactable":
				comp = InteractableComponent.new()
			"dialog":
				comp = DialogComponent.new(d)
			"math_challenge":
				comp = MathChallengeComponent.new(d)
		if comp != null:
			comp.init_component(self)
			_components.append(comp)

func _exit_tree() -> void:
	for c in _components:
		c.destroy()

func _lookup_definition(id: String) -> Dictionary:
	var reg: Variant = DataManager.get_data("NPC_REGISTRY")
	var list: Array = []
	if reg is Dictionary and reg.has("npcs"):
		list = reg["npcs"]
	elif reg is Array:
		list = reg
	for n in list:
		if String(n.get("id", "")) == id:
			return n
	return {}
