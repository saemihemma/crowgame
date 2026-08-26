extends TestCase
## The magic door will not open until the owls are out of their chains.
##
## This is the rule that makes the maths the point of the level rather than an
## optional detour: a child could previously run past every owl in the world and
## still clear it. Three things have to hold, and each fails silently on its own:
##
## 1. The requirement is per level and clamped. A registry asking for more owls
##    than a level holds gives a door that never opens, and nothing errors - the
##    child just walks into it forever.
## 2. The door consults the gate before it transitions, and says something when
##    it refuses. A door that transitions anyway is the bug this whole change is
##    about, and it looks identical to the old build.
## 3. The refusal has words in both locales, with the number substituted. A
##    missing {n} shows a child the sentence without the one fact in it.


func _root() -> Node:
	return Engine.get_main_loop().root

func _levels() -> Node:
	return _root().get_node("LevelManager")


# --- 1. the requirement ------------------------------------------------------

## The four cases, two of which the shipped registry does not contain.
func test_the_requirement_defaults_to_every_owl_and_clamps() -> void:
	var lm := _levels()
	assert_eq(lm.required_for_door({}, 3), 3,
		"omitting the field means all the owls in the level, which is what a story level wants")
	assert_eq(lm.required_for_door({"owlsRequiredForDoor": 2}, 3), 2,
		"a level may ask for fewer than it holds, so a hard-to-reach owl does not lock it")
	assert_eq(lm.required_for_door({"owlsRequiredForDoor": 9}, 3), 3,
		"a requirement above the owl count is clamped; otherwise the door never opens and nothing says why")
	assert_eq(lm.required_for_door({"owlsRequiredForDoor": 0}, 20), 0,
		"0 means no gate at all - the practice arena, where leaving is not an achievement")

## Every story level is gated on all of its owls, and the practice arena is not.
## Read off the shipped registry, so adding a level with a typo'd requirement
## fails here rather than in a child's hands.
func test_the_shipped_registry_gates_every_story_level() -> void:
	var lm := _levels()
	var story := 0
	for entry in lm.get_levels():
		var key := String(entry.get("key", ""))
		var owls: int = lm.owl_count(key)
		var required: int = lm.owls_required_for_door(key)
		assert_true(required <= owls,
			"'%s' asks for %d owls and holds %d; a door asking for more than exists never opens"
				% [key, required, owls])
		if key == "level_99":
			assert_eq(required, 0, "the practice arena's door is not gated")
			continue
		assert_true(owls > 0, "'%s' holds at least one owl to free" % key)
		assert_eq(required, owls,
			"'%s' is a story level, so its door waits for all %d owls" % [key, owls])
		story += 1
	assert_true(story >= 8, "the check reached the story levels (%d)" % story)


# --- 2. the door ------------------------------------------------------------

## Stands in for Game. The door finds its game by walking up for a node that
## answers transition_to_level, so this is all it needs to be.
class StubGame extends Node2D:
	var player := Node2D.new()
	var locked := true
	var refusals := 0
	var went_to := ""

	func _init() -> void:
		add_child(player)

	func get_player() -> Node2D:
		return player

	func door_is_locked() -> bool:
		return locked

	func refuse_door() -> void:
		refusals += 1

	func transition_to_level(target: String) -> void:
		went_to = target


func _mount_door() -> Array:
	var game := StubGame.new()
	_root().add_child(game)
	var door = load("res://scenes/Door.tscn").instantiate()
	game.add_child(door)
	# Contact is normally latched by body_entered, which needs a physics frame and
	# a real player body. The latch itself is one line; what this test is about is
	# what the door does while it is set.
	door._player_inside = true
	return [game, door]


func test_a_locked_door_refuses_instead_of_transitioning() -> void:
	var pair := _mount_door()
	var game: StubGame = pair[0]
	var door = pair[1]
	door._process(0.1)
	assert_eq(game.went_to, "",
		"a locked door must not transition; this is the bug the whole gate exists to stop")
	assert_eq(game.refusals, 1, "and it must say so, once")

	# The cooldown: standing against a shut door is one card, not a stream.
	door._process(0.1)
	assert_eq(game.refusals, 1, "a second frame against the same door says nothing new")
	door._process(door.REFUSE_COOLDOWN + 0.1)
	assert_eq(game.refusals, 2, "after the cooldown it will answer again")
	game.queue_free()


func test_the_door_opens_the_moment_the_last_owl_is_free() -> void:
	var pair := _mount_door()
	var game: StubGame = pair[0]
	var door = pair[1]
	door.target_level = "level_02"
	game.locked = false
	# Contact is POLLED, not taken off body_entered, precisely so this works: a
	# child standing in the doorway when the last chain breaks has already had
	# their one body_entered, and would otherwise be sealed into an open door.
	door._process(0.1)
	assert_eq(game.went_to, "level_02", "an unlocked door the player is standing in transitions")
	assert_eq(game.refusals, 0, "and says nothing about owls")
	game.queue_free()


# --- 3. the words -----------------------------------------------------------

## Both locales, both plural forms, with the number actually in the sentence.
##
## The count on the card is the big number above this line; the line repeats it
## because a child who can read gets the sentence and a child who cannot gets the
## numeral, and neither should be shown "Save more owls!" with the number gone.
func test_the_refusal_says_how_many_in_both_languages() -> void:
	var tm: Node = _root().get_node("TextManager")
	var was: String = tm.get_locale()
	for locale in ["en", "is"]:
		tm.set_locale(locale)
		for n in [1, 2, 3]:
			var line: String = tm.tp("door.locked", {"n": n}, "n")
			assert_true(line != "", "%s: door.locked resolves for n=%d" % [locale, n])
			assert_true(line.contains(str(n)),
				"%s: the refusal carries the number (n=%d, got '%s')" % [locale, n, line])
			assert_true(not line.contains("{"),
				"%s: every placeholder was substituted (n=%d, got '%s')" % [locale, n, line])
	tm.set_locale(was)


# --- 4. the card ------------------------------------------------------------

func _present_card(freed: int, required: int) -> CanvasLayer:
	var layer := CanvasLayer.new()
	_root().add_child(layer)
	LockedDoorCard.present(layer, freed, required)
	return layer

func _descendants(node: Node, out: Array) -> Array:
	out.append(node)
	for child in node.get_children():
		_descendants(child, out)
	return out

func _labels(layer: CanvasLayer) -> Array:
	var found := []
	for node in _descendants(layer, []):
		if node is Label:
			found.append(node)
	return found


## The card has to work for a child who cannot read the sentence on it, so the
## things that carry the meaning without words are the ones under test: the owl
## in its chains, one pip per owl the door wants, and the number left.
func test_the_card_says_it_without_words_too() -> void:
	var layer := _present_card(1, 3)
	var nodes: Array = _descendants(layer, [])
	var has_owl := false
	var pips: PipRow = null
	for node in nodes:
		if node is TextureRect and (node as TextureRect).texture != null:
			has_owl = true
		if node is PipRow:
			pips = node
	assert_true(has_owl, "the chained owl is on the card; it is the fastest thing on it to read")
	assert_true(pips != null, "the pip row is there")
	if pips != null:
		assert_eq(pips.total, 3, "one pip per owl the door is waiting for")
		assert_eq(pips.filled, 1, "the owl already freed is already gold")

	var texts := []
	for label: Label in _labels(layer):
		texts.append(label.text)
	assert_true(texts.has("2"),
		"the number still needed is on the card on its own (got %s)" % str(texts))
	layer.queue_free()


## A second refusal replaces the first card. Two cards at once means two numbers
## at once, at half opacity each, which is worse than saying nothing.
func test_a_second_refusal_replaces_the_card() -> void:
	var layer := _present_card(0, 3)
	LockedDoorCard.present(layer, 1, 3)
	var cards := 0
	for node in _descendants(layer, []):
		if node is LockedDoorCard:
			cards += 1
	assert_eq(cards, 1, "one card is up, not two stacked (got %d)" % cards)
	layer.queue_free()


## Above the pip cap the row is dropped rather than drawn as a bar chart, and the
## number has to carry it alone - so the number must still be there.
func test_a_level_above_the_pip_cap_still_says_the_number() -> void:
	var many: int = LockedDoorCard.PIPS_MAX + 4
	var layer := _present_card(0, many)
	for node in _descendants(layer, []):
		assert_true(not (node is PipRow),
			"above %d owls the pip row is dropped; it stops being countable" % LockedDoorCard.PIPS_MAX)
	var texts := []
	for label: Label in _labels(layer):
		texts.append(label.text)
	assert_true(texts.has(str(many)),
		"the number carries it alone above the cap (got %s)" % str(texts))
	layer.queue_free()
