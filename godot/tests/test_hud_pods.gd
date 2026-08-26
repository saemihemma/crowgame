extends TestCase
## HUD geometry that no assertion covered and no screenshot contained.
##
## Two states shipped broken because they are only reachable after something has
## HAPPENED, and nothing in the harness made it happen. `godot/tools/capture.sh`
## now has `hud-hurt`, `hud-streak` and `hud-ability` variants, and the first
## time they ran they showed:
##
##   - a lit streak with no flame on the ring at all. The dashes were drawn at
##     RADIUS + 6 = 38px, and the bezel is an 11px band covering 28-39 with the
##     paper rim on top of it -- so a 1.5px dash at 45% alpha was laid over the
##     two widest strokes the ring draws.
##   - "Double Jump" printed across the jump button. The ability row anchored to
##     the bottom right because the top right belongs to the owl ring, which
##     skipped the question of what was already in the bottom right.
##
## A screenshot found both. These are what stop them coming back, because both
## are arithmetic on constants and neither needs a frame to be rendered.

func _reset() -> void:
	_failures.clear()
	_assertions = 0


# --- the streak flame ------------------------------------------------------

## The band the ring's own strokes occupy. Anything meant to be seen ON TOP of
## the ring has to be outside it, not inside it at a lower alpha.
func _ring_ink_outer_edge() -> float:
	var bezel_outer: float = OwlRing.RADIUS + OwlRing.BEZEL_RADIUS_OFFSET + OwlRing.BEZEL * 0.5
	var rim_outer: float = OwlRing.RADIUS + OwlRing.BEZEL * 0.5 + OwlRing.RIM * 0.5 + OwlRing.RIM * 0.5
	return maxf(bezel_outer, rim_outer)


func test_the_streak_flame_is_drawn_clear_of_the_rings_own_ink() -> void:
	var inner_edge_of_flame: float = OwlRing.FLAME_RADIUS - OwlRing.FLAME_THICKNESS * 0.5
	var ink := _ring_ink_outer_edge()
	assert_true(inner_edge_of_flame >= ink,
		"the flame starts at %.1fpx, outside the ring's ink at %.1fpx -- inside it, "
		% [inner_edge_of_flame, ink]
		+ "a thin dash over an 11px bezel is invisible, which is how a lit streak "
		+ "shipped showing no flame")


## A flame at 45% alpha over the bezel was the other half of the same bug: even
## outside the ink it has to be able to hold its own against a bright sky.
func test_the_flame_is_heavy_enough_to_read() -> void:
	assert_true(OwlRing.FLAME_THICKNESS >= 2.5,
		"the flame stroke is at least 2.5px (got %.1f)" % OwlRing.FLAME_THICKNESS)


## EXTENT sizes the control box and is what the HUD anchors its right margin
## from. The flame is now the outermost ink, so EXTENT has to contain it or the
## pod claims a margin it does not honour.
func test_the_control_box_contains_the_flame() -> void:
	assert_true(OwlRing.EXTENT >= OwlRing.FLAME_RADIUS + OwlRing.FLAME_THICKNESS * 0.5,
		"EXTENT (%.1f) reaches the flame's outer edge (%.1f)"
		% [OwlRing.EXTENT, OwlRing.FLAME_RADIUS + OwlRing.FLAME_THICKNESS * 0.5])


# --- the ability chips -----------------------------------------------------

## The left pod is hearts, then coins, then abilities: three answers to "what do
## I have", stacked, each below the last. Asserting the ORDER rather than the
## pixel keeps the check true when a heart or a chip is resized.
func test_the_ability_row_sits_below_the_coin_chip_in_the_left_pod() -> void:
	# Hud.tscn, not HUD.tscn. The first version of this test loaded the wrong
	# case, errored on instantiate() and was reported as PASSING -- a script error
	# aborts the function before any assertion runs, so a vacuous test looks
	# identical to a green one. Assert the scene loaded before using it.
	var scene: PackedScene = load("res://scenes/Hud.tscn")
	assert_true(scene != null, "res://scenes/Hud.tscn loads")
	if scene == null:
		return
	var hud: CanvasLayer = scene.instantiate()
	Engine.get_main_loop().root.add_child(hud)
	await Engine.get_main_loop().process_frame

	var row: Control = hud._ability_row
	var chip: Control = hud._coin_chip
	var hearts: Control = hud._hearts
	assert_true(row != null and chip != null and hearts != null, "the three left-pod rows exist")
	if row == null or chip == null or hearts == null:
		hud.queue_free()
		return

	assert_true(chip.position.y > hearts.position.y, "coins sit below the hearts")
	assert_true(row.position.y >= chip.position.y + CoinChip.HEIGHT,
		"abilities sit below the coin chip (row at y=%.0f, chip ends at y=%.0f)"
		% [row.position.y, chip.position.y + CoinChip.HEIGHT])
	assert_true(is_equal_approx(row.position.x, hearts.position.x),
		"and share the pod's left edge")

	# The bottom-right corner belongs to the jump and shoot buttons. A chip whose
	# row starts in the bottom half of a 540-tall design viewport is over them.
	assert_true(row.position.y < 270.0,
		"the ability row stays in the top half, clear of the touch controls "
		+ "(got y=%.0f)" % row.position.y)
	hud.queue_free()
