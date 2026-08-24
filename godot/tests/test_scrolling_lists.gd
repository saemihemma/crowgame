extends TestCase
## Lists that grow with content must stay reachable inside the 540-tall viewport.
##
## The web build shipped this bug twice: level select laid six registry levels
## out flat and put the sixth at y=700, so two levels existed and could not be
## selected; the login profile list did the same once a family had four children,
## pushing "+ New User" off the bottom so a fifth could never be added.
##
## These assertions are about reachability, not looks: a list whose contents can
## exceed the viewport must live inside a ScrollContainer, and that container
## must itself fit on screen.

const VIEWPORT_H := 540.0
const VIEWPORT_W := 960.0


## The live viewport, not the project's base resolution.
##
## The stretch aspect is `expand` now, so the viewport is 960/aspect tall and as
## wide as the device makes it - 960x720 on a 4:3 tablet, 1171x540 on a phone. A
## screen anchored to that viewport is correctly larger than the base 960x540,
## and comparing it against the base reported a scroller that fits perfectly as
## overflowing by 300px.
func _viewport_size() -> Vector2:
	return Engine.get_main_loop().root.get_visible_rect().size


## Instantiate a routed scene, let it lay out, and hand it back.
func _mount(route: String) -> Node:
	var path := SceneRouter.path_of(route)
	assert_true(path != "", "route '%s' resolves to a scene" % route)
	if path == "":
		return null
	var scene: PackedScene = load(path)
	var node: Node = scene.instantiate()
	Engine.get_main_loop().root.add_child(node)
	return node


func _find(node: Node, type: String) -> Node:
	if node.is_class(type):
		return node
	for child in node.get_children():
		var hit := _find(child, type)
		if hit != null:
			return hit
	return null


## `axis` is the direction the list is meant to grow in. The invariant is not
## "lists are vertical" - level select is a horizontal row of world cards now -
## but that a growing list lives in a scroller, that the scroller fits on screen,
## and that it moves on exactly one axis. A list that scrolls both ways is a
## place a child gets lost in.
func _assert_scrollable(route: String, axis := VERTICAL) -> void:
	var root := _mount(route)
	if root == null:
		return

	var scroll := _find(root, "ScrollContainer")
	assert_true(scroll != null, "%s puts its growing list in a ScrollContainer" % route)

	if scroll != null:
		var view := _viewport_size()
		var rect: Rect2 = (scroll as Control).get_global_rect()
		assert_true(rect.size.y > 0.0, "%s scroll viewport has height" % route)
		assert_true(rect.size.x > 0.0, "%s scroll viewport has width" % route)
		assert_true(
			rect.position.y >= -1.0 and rect.end.y <= view.y + 1.0,
			"%s scroll viewport fits the %dpx-tall screen (got %.0f..%.0f)"
				% [route, int(view.y), rect.position.y, rect.end.y],
		)
		assert_true(
			rect.position.x >= -1.0 and rect.end.x <= view.x + 1.0,
			"%s scroll viewport fits the %dpx-wide screen (got %.0f..%.0f)"
				% [route, int(view.x), rect.position.x, rect.end.x],
		)
		# Exactly one axis moves: the other is pinned.
		var container := scroll as ScrollContainer
		if axis == VERTICAL:
			assert_eq(container.horizontal_scroll_mode, ScrollContainer.SCROLL_MODE_DISABLED,
				"%s scrolls vertically only" % route)
			assert_true(container.vertical_scroll_mode != ScrollContainer.SCROLL_MODE_DISABLED,
				"%s can actually scroll vertically" % route)
		else:
			assert_eq(container.vertical_scroll_mode, ScrollContainer.SCROLL_MODE_DISABLED,
				"%s scrolls horizontally only" % route)
			assert_true(container.horizontal_scroll_mode != ScrollContainer.SCROLL_MODE_DISABLED,
				"%s can actually scroll horizontally" % route)

	root.queue_free()


## Level select is a horizontal row of world cards: six do not fit across 960px
## and more worlds are coming, so the sideways scroller is what keeps a seventh
## reachable.
func test_level_select_list_scrolls() -> void:
	_assert_scrollable("level_select", HORIZONTAL)


func test_login_profile_list_scrolls() -> void:
	_assert_scrollable("login")


## The registry already needs more width than the screen has, which is what makes
## the scroller load-bearing rather than precautionary.
##
## This used to assert `true` in both branches of an if/else - it reported which
## case it was in and could not fail either way. Now it states the fact.
func test_level_row_exceeds_a_flat_screen() -> void:
	var levels: Array = LevelManager.get_levels()
	assert_true(levels.size() >= 1, "level registry is not empty")
	var card := WorldCard.SIZE.x + 20.0
	var row_width := float(levels.size()) * card
	assert_true(row_width > VIEWPORT_W,
		"the %d world cards need %.0fpx across a %.0fpx screen, so the row must scroll"
			% [levels.size(), row_width, VIEWPORT_W])
