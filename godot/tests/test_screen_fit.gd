extends TestCase
## Nothing a player has to read or press may fall off the screen.
##
## This exists because it did. `stretch/aspect=expand` guarantees the viewport is
## never SMALLER than the base 960x540 - which is true, and which is why nobody
## checked the other half: expand grows the roomier axis and leaves the other at
## the base, so on any display at 16:9 or wider the viewport is exactly 540 tall.
## Every menu here is a centred column of Gate-B3 rows (88px floor) under a large
## title, and those columns are taller than that. The pause menu lost its Quit
## row, the main menu lost the top of HÖRMANN and its last button, and the game
## shipped that way, because the one device it was played on daily is an iPad -
## 4:3, 720 tall, room to spare.
##
## The gate is the tightest viewport, not the comfortable one.

## 960x540 is the floor in both axes and cannot be undercut; the others are the
## real shapes that reach it from different directions.
const VIEWPORTS := [
	{"name": "16:9 desktop", "size": Vector2(960, 540)},
	{"name": "21:9 ultrawide", "size": Vector2(1290, 540)},
	{"name": "iPad 4:3 landscape", "size": Vector2(960, 720)},
]

## Screens made of a fixed, known column. A list that GROWS with content is a
## different contract and lives in test_scrolling_lists.gd: login and level
## select scroll, because a family can add children and a registry can add
## worlds, and shrinking a list to fit is the wrong answer to that.
## `boot` is here for two reasons. Its column carries a 96px wordmark, so it is a
## fit case like the others — and mounting it is the only headless thing that
## loads boot.gd at all. A parse error in it used to reach a browser before
## anything noticed, because no test had ever instantiated the title screen.
const ROUTES := ["boot", "main_menu", "cloud_panel"]

const PAUSE_SCENE := preload("res://scenes/Pause.tscn")


func _fitters(node: Node, out: Array) -> Array:
	if node is FitBox:
		out.append(node)
	for child in node.get_children():
		_fitters(child, out)
	return out


## Mount a screen, lay every fitter in it out against `view`, and report the
## worst overflow in pixels. Zero means everything is on screen.
func _worst_overflow(root: Node, view: Vector2) -> Dictionary:
	var fitters: Array = _fitters(root, [])
	if fitters.is_empty():
		return {"overflow": -1.0, "where": "no FitBox", "scale": 1.0}
	var worst := 0.0
	var where := ""
	var tightest := 1.0
	for fitter: FitBox in fitters:
		fitter.fit_for(view)
		var rect := fitter.card_rect()
		var over := maxf(
			maxf(-rect.position.x, -rect.position.y),
			maxf(rect.end.x - view.x, rect.end.y - view.y))
		tightest = minf(tightest, fitter.fit_scale())
		if over > worst:
			worst = over
			where = str(rect.position) + ".." + str(rect.end)
	return {"overflow": worst, "where": where, "scale": tightest}


## Headless, the main menu draws its shortest possible column: no save, no
## profile, not the web build, so PLAY is the only row. That column fits 540
## with room to spare, which means asserting on it as-mounted proves nothing -
## it passed with the fitter deliberately returning 1.0 for everything.
##
## So the menu is GROWN first. Every row this screen can show is conditional on
## player state, and the shape that reached the owner had all of them; adding
## rows until the column is taller than any viewport tests the mechanism rather
## than today's state.
const GROWN_ROWS := 6

func test_menu_screens_fit_the_tightest_viewport() -> void:
	for route in ROUTES:
		var path := SceneRouter.path_of(String(route))
		assert_true(path != "", "route '%s' resolves to a scene" % route)
		if path == "":
			continue
		var root: Node = (load(path) as PackedScene).instantiate()
		Engine.get_main_loop().root.add_child(root)

		var fitters: Array = _fitters(root, [])
		assert_true(fitters.size() > 0,
			"'%s' has no FitBox — its content is centred, so it is cut when it outgrows the viewport" % route)

		for fitter: FitBox in fitters:
			var card := fitter.get_child(0) as Control
			if card == null:
				continue
			for i in GROWN_ROWS:
				card.add_child(BrandButton.make("row", BrandButton.Role.SECONDARY, Callable()))

		for viewport in VIEWPORTS:
			var result := _worst_overflow(root, viewport["size"])
			assert_true(float(result["overflow"]) == 0.0,
				"[%s @ %s] the menu overflows by %.0fpx (%s)"
					% [route, str(viewport["size"]), float(result["overflow"]), result["where"]])
			assert_true(float(result["scale"]) < 1.0,
				"[%s @ %s] a column of %d extra rows was not scaled at all — the fitter is not doing anything"
					% [route, str(viewport["size"]), GROWN_ROWS])
		root.queue_free()


## The pause card is not a route - it is instantiated over a running level - so
## it needs its own mount. It is also the screen the owner actually caught: five
## rows and a 44px title is 596 tall against a 540 viewport.
func test_the_pause_card_fits_the_tightest_viewport() -> void:
	var pause: CanvasLayer = PAUSE_SCENE.instantiate()
	Engine.get_main_loop().root.add_child(pause)
	for viewport in VIEWPORTS:
		var result := _worst_overflow(pause, viewport["size"])
		assert_true(float(result["overflow"]) == 0.0,
			"[pause @ %s] the pause card overflows by %.0fpx (%s)"
				% [str(viewport["size"]), float(result["overflow"]), result["where"]])
	pause.queue_free()


## The locked-door card is the one overlay a child will meet by accident, over
## and over, and it is the tallest thing the FX layer ever mounts: a 112px owl, a
## pip row, an 80px numeral and a line of text. It also renders in no test that
## looks at a screen, which is exactly the shape of the boot.gd bug - a Control
## nobody had ever instantiated, broken in a browser and green here.
func test_the_locked_door_card_fits_the_tightest_viewport() -> void:
	var layer := CanvasLayer.new()
	Engine.get_main_loop().root.add_child(layer)
	# Eight owls, none freed: the widest pip row the card will draw.
	LockedDoorCard.present(layer, 0, LockedDoorCard.PIPS_MAX)
	var fitters: Array = _fitters(layer, [])
	assert_true(fitters.size() == 1,
		"the card mounts through exactly one FitBox (got %d)" % fitters.size())
	for viewport in VIEWPORTS:
		var result := _worst_overflow(layer, viewport["size"])
		assert_true(float(result["overflow"]) == 0.0,
			"[locked door @ %s] the card overflows by %.0fpx (%s)"
				% [str(viewport["size"]), float(result["overflow"]), result["where"]])
	layer.queue_free()


## And prove the arithmetic itself, at sizes the project does not ship - the same
## reason SpriteSheet.compute_anchor_offset is tested apart from the registry. A
## fitter that returned 1.0 for everything would pass every assertion above on a
## screen that happens to fit today.
func test_the_fit_arithmetic() -> void:
	var view := Vector2(960, 540)
	var room := view - Vector2(FitBox.MARGIN, FitBox.MARGIN) * 2.0

	assert_eq(FitBox.scale_for(Vector2(100, 100), view), 1.0,
		"a card that fits is never scaled")
	assert_eq(FitBox.scale_for(room, view), 1.0,
		"a card exactly filling the room inside the margin is not scaled")
	assert_true(is_equal_approx(FitBox.scale_for(Vector2(room.x, room.y * 2.0), view), 0.5),
		"a card twice as tall as the room halves")
	assert_true(is_equal_approx(FitBox.scale_for(Vector2(room.x * 4.0, room.y), view), 0.25),
		"the tighter axis decides")
	assert_eq(FitBox.scale_for(Vector2.ZERO, view), 1.0,
		"a card with no size does not divide by zero")

	# The shape that shipped: the pause card, roughly, against the viewport a
	# 16:9 display gives it.
	var pause_card := Vector2(352, 596)
	assert_true(FitBox.scale_for(pause_card, view) < 1.0,
		"the pause card does not fit 960x540 unscaled - if this ever passes, the card shrank")
