extends Node2D
class_name Npc
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
var _player_in_range := false
var _prompt: Label
var _bob_time := 0.0
var _bob_amp := 8.0
var _bob_speed := 1.5
var _sprite_base_y := 0.0

@onready var _sprite: Sprite2D = $Sprite
@onready var _zone: Area2D = $InteractZone

## Where this NPC's feet belong, in world space.
##
## NPC objects are authored as Tiled *tile* objects, whose origin is bottom-left,
## so the spawn's `y` is already the ground line. The player spawn and enemies are
## authored as plain rectangles, whose `y` is the top edge - which is why those
## add `height` and this must not. The level compiler records both shapes as the
## same {x, y, width, height} and loses the distinction, so each entity has to
## know which convention its own objects use.
##
## Adding `height` here put every NPC in the game exactly one sprite height
## underground. The owl sprite is 64px tall and NPC spawns are 64px boxes, so the
## error was the full height of the character: the owls were not sunk, they were
## buried, standing in the soil with their heads below the grass line.
static func feet_from_spawn(s: Dictionary) -> Vector2:
	return Vector2(float(s["x"]) + float(s["width"]) * 0.5, float(s["y"]))

func setup_from_spawn(s: Dictionary) -> void:
	position = feet_from_spawn(s)
	npc_id = String(s.get("props", {}).get("npc_id", npc_id))

func _ready() -> void:
	add_to_group("npc")
	definition = _lookup_definition(npc_id)
	display_name = String(definition.get("name", "NPC"))
	reward_amount = int(definition.get("behaviorConfig", {}).get("rewardAmount", 1))
	# npc_registry.json names a sprite key; the path and frame grid live in
	# sprite_registry.json, so a re-exported owl is a registry edit, not this file.
	var sprite_key := String(definition.get("spriteKey", "owl"))
	var tex := SpriteSheet.texture(sprite_key)
	if tex != null:
		_sprite.texture = tex
	_sprite.offset = SpriteSheet.anchor_offset(sprite_key, SpriteSheet.grounding_sink())
	_sprite_base_y = _sprite.position.y
	var npc_tuning := DataManager.get_dict("NPC_TUNING")
	_bob_amp = float(npc_tuning.get("float_bob_amplitude", 8))
	_bob_speed = float(npc_tuning.get("float_bob_speed", 1.5))
	_build_components(definition.get("components", []))
	_build_prompt()
	_zone.body_entered.connect(_on_body_entered)
	_zone.body_exited.connect(_on_body_exited)

func _process(delta: float) -> void:
	for c in _components:
		c.update_component(delta)
	_update_idle_bob(delta)
	# Phaser overlap is continuous: if the player stays in range, re-trigger
	# once the interaction cooldown elapses (BaseNPC interaction loop).
	if _player_in_range and not _interacting and not _flown and Time.get_ticks_msec() >= _cooldown_until:
		interact()
	_update_prompt_visibility()

func _update_idle_bob(delta: float) -> void:
	# Idle float-bob from npc_tuning.json (cached at _ready; amplitude 8, speed 1.5).
	#
	# Upward only. The bob used to swing symmetrically around the rest position,
	# which meant a ground-standing NPC had its feet in the soil for half of
	# every cycle. Same travel and same rate, biased so the resting pose is the
	# lowest the sprite ever goes.
	_bob_time += delta * _bob_speed
	if _sprite and not _flown:
		var rise := (1.0 - cos(_bob_time * TAU * 0.5)) * 0.5
		_sprite.position.y = _sprite_base_y - rise * _bob_amp

func _build_prompt() -> void:
	_prompt = Label.new()
	_prompt.text = display_name
	_prompt.add_theme_font_size_override("font_size", 16)
	_prompt.add_theme_color_override("font_color", Color.WHITE)
	_prompt.add_theme_color_override("font_shadow_color", Color.BLACK)
	_prompt.add_theme_constant_override("shadow_offset_x", 2)
	_prompt.add_theme_constant_override("shadow_offset_y", 2)
	_prompt.position = Vector2(-48, -96)
	_prompt.size = Vector2(96, 20)
	_prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_prompt.visible = false
	add_child(_prompt)

func _update_prompt_visibility() -> void:
	if _prompt == null:
		return
	_prompt.visible = _player_in_range and not _interacting and not _flown

func _on_body_entered(body: Node) -> void:
	if body.is_in_group("player"):
		_player_in_range = true
		interact()

func _on_body_exited(body: Node) -> void:
	if body.is_in_group("player"):
		_player_in_range = false

func interact() -> void:
	if _interacting or _flown:
		return
	if Time.get_ticks_msec() < _cooldown_until:
		return
	_interacting = true
	AudioManager.play_event("owl_greet")
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
