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
	_build_chains()
	_build_components(definition.get("components", []))
	_build_prompt()
	_zone.body_entered.connect(_on_body_entered)
	_zone.body_exited.connect(_on_body_exited)
	EventBus.math_challenge_complete.connect(_on_challenge_complete)

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

## The name that floats above an owl as a child walks up to it.
##
## It carries the QUESTION COUNT for a chain owl, and that is the point. The
## chain links on the perch already encode it -- one link per question, broken as
## each is answered -- but they encode it by inference: a one-question owl draws
## no chain at all (MIN_VISIBLE_CHAIN_LINKS), so the language a child has to
## work out is "nothing means one, two links mean two". A playtester met the
## first twin owl in level 3 and read the second question as a malfunction:
## "why is there an owl now in one level with 2 math?"
##
## So the count is also said in words, once, before the child commits. Only for
## chain owls: appending "1 question" to every single-question owl in the game
## would be noise on the overwhelmingly common case, and would make the number
## stop being a warning.
func _build_prompt() -> void:
	_prompt = Label.new()
	_prompt.text = _prompt_text()
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

func _prompt_text() -> String:
	var questions := _question_count()
	if questions < 2:
		return display_name
	return TextManager.t("npc.owl_questions", [display_name, str(questions)])

## How many problems this owl will ask, read from its own math component rather
## than from behaviorConfig.chainLinks -- the chain is the DECORATION of the
## count and the component is the count itself, and a mismatch between them
## should show up as a wrong chain rather than as a wrong number.
func _question_count() -> int:
	for c in definition.get("components", []):
		if c is Dictionary and String((c as Dictionary).get("type", "")) == "math_challenge":
			return int((c as Dictionary).get("problemCount", 1))
	return 1

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

## How long an NPC waits before offering again after a normal encounter ends,
## and after one that never started. The second is shorter because nothing
## happened: a maths board belonging to a NEARBY owl is the usual reason, the
## player cannot walk away while it is up, and the owl they are standing on
## should be ready the moment it closes.
const COOLDOWN_MS := 2000
const DECLINED_BACKOFF_MS := 750

## Start an encounter, IF a component will actually take it.
##
## The flag, the greeting and the hidden prompt used to be set before any
## component was asked. A component that could not open anything -- because
## another owl's board was still on screen, or the level was mid-reload -- then
## left this NPC flagged mid-encounter with nothing to end it: the prompt stays
## hidden, the re-trigger loop in _process skips it, completion events are
## ignored, and standing on the owl does nothing for the rest of the level. That
## is the "the maths problem does not open" report.
##
## So the commit is now conditional. Nothing is announced until something has
## said yes, and a declined offer rolls all the way back and simply tries again
## shortly -- silently, because an owl greeting every couple of seconds behind
## somebody else's lesson is its own bug.
func interact() -> void:
	if _interacting or _flown:
		return
	if Time.get_ticks_msec() < _cooldown_until:
		return
	_interacting = true
	var accepted := false
	for c in _components:
		if c.on_interact():
			accepted = true
	if not accepted:
		_interacting = false
		_cooldown_until = Time.get_ticks_msec() + DECLINED_BACKOFF_MS
		return
	AudioManager.play_event("owl_greet")

func end_interaction() -> void:
	_interacting = false
	_cooldown_until = Time.get_ticks_msec() + COOLDOWN_MS

# ─── Chains (brand/BRAND_SYSTEM.md §3.4a) ──────────────────
## One link per answer this owl still wants. Drawn across the perch rather than
## around the owl - the owl is stuck, not imprisoned (§3.4) - and a link bursts
## on each correct answer.
##
## The point is that the count is readable from across the screen: a three-link
## owl has to look like more work *before* a child walks over and commits, or
## the roster of variants may as well not exist.
## Registry keys, not paths — ARCHITECTURE rule 7. Both are `attachment` class
## (32x32, centred); sprite_registry.json owns where they live.
const CHAIN_SPRITE := "chain_link"
const CHAIN_BURST_SPRITE := "chain_link_burst"
## Wide enough that three links reach past the owl's own silhouette. At a
## tighter spacing the whole chain sat inside the 44px body and a three-link owl
## looked exactly like a one-link owl from any distance - which is the one thing
## it must not do.
const CHAIN_LINK_SIZE := 22.0
const CHAIN_SPACING := 24.0
const CHAIN_PERCH_Y := -5.0

var _chain_links: Array[Sprite2D] = []

## A chain is a COUNT, and one link counts nothing.
##
## chainLinks mirrors problemCount (tools/validate-content.ts enforces it), and
## most owls ask exactly one question -- so most owls were wearing a single 22px
## ring hovering at their feet with nothing beside it to be one *of*. A player
## asked what it was, which is the whole answer: a set of one communicates no
## size, so it reads as debris rather than as "this owl wants one answer".
##
## Two or more still earns the row, and still breaks link by link. The owl
## sprite is already drawn in chains holding a padlock, so "locked" was never
## resting on this either way.
const MIN_VISIBLE_CHAIN_LINKS := 2

func _build_chains() -> void:
	var count := int(definition.get("behaviorConfig", {}).get("chainLinks", 0))
	var texture := SpriteSheet.texture(CHAIN_SPRITE)
	if count < MIN_VISIBLE_CHAIN_LINKS or texture == null:
		return
	var span := float(count - 1) * CHAIN_SPACING
	for i in count:
		var link := Sprite2D.new()
		link.texture = texture
		link.scale = Vector2.ONE * (CHAIN_LINK_SIZE / float(texture.get_width()))
		link.position = Vector2(-span * 0.5 + float(i) * CHAIN_SPACING, CHAIN_PERCH_Y)
		link.z_index = 1
		add_child(link)
		_chain_links.append(link)

## A correct answer breaks one link. Only while this owl is the one being
## answered: math_challenge_complete is global, and every owl in the level
## hears it.
func _on_challenge_complete(result: Dictionary) -> void:
	if not _interacting or _flown:
		return
	if not bool(result.get("correct", false)):
		return
	_break_link()

func _break_link() -> void:
	if _chain_links.is_empty():
		return
	var link: Sprite2D = _chain_links.pop_back()
	if not is_instance_valid(link):
		return
	var burst := SpriteSheet.texture(CHAIN_BURST_SPRITE)
	if burst != null:
		link.texture = burst
	AudioManager.play_event("chain_break")
	DopamineFX.burst(get_parent(), link.global_position,
		ThemeManager.get_color_value("enemy_pop"), int(Config.fx("burst/chain_link", 12)))
	var tw := link.create_tween().set_parallel(true)
	tw.tween_property(link, "scale", link.scale * 1.8, 0.22).set_trans(Tween.TRANS_BACK)
	tw.tween_property(link, "modulate:a", 0.0, 0.22)
	tw.chain().tween_callback(link.queue_free)

func is_interacting() -> bool:
	return _interacting

func fly_away() -> void:
	if _flown:
		return
	_flown = true
	# The last link takes the perch with it (§3.4a).
	while not _chain_links.is_empty():
		_break_link()
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
