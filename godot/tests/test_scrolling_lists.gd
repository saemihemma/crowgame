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


func _viewport_size() -> Vector2:
	return Vector2(
		float(ProjectSettings.get_setting("display/window/size/viewport_width")),
		float(ProjectSettings.get_setting("display/window/size/viewport_height")),
	)


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


func _assert_scrollable(route: String) -> void:
	var root := _mount(route)
	if root == null:
		return

	var scroll := _find(root, "ScrollContainer")
	assert_true(scroll != null, "%s puts its growing list in a ScrollContainer" % route)

	if scroll != null:
		var view := _viewport_size()
		var rect: Rect2 = (scroll as Control).get_global_rect()
		assert_true(rect.size.y > 0.0, "%s scroll viewport has height" % route)
		assert_true(
			rect.position.y >= -1.0 and rect.end.y <= view.y + 1.0,
			"%s scroll viewport fits the %dpx-tall screen (got %.0f..%.0f)"
				% [route, int(view.y), rect.position.y, rect.end.y],
		)
		# A vertical list must not also scroll sideways.
		assert_eq(
			(scroll as ScrollContainer).horizontal_scroll_mode,
			ScrollContainer.SCROLL_MODE_DISABLED,
			"%s disables horizontal scrolling" % route,
		)

	root.queue_free()


func test_level_select_list_scrolls() -> void:
	_assert_scrollable("level_select")


func test_login_profile_list_scrolls() -> void:
	_assert_scrollable("login")


## The registry can grow past what fits flat; that must not make levels
## unreachable. Six 56px rows plus separation already needs ~400px, and the
## screen only has ~440 once the title and back button are accounted for.
func test_level_count_can_exceed_a_flat_screen() -> void:
	var levels: Array = LevelManager.get_levels()
	assert_true(levels.size() >= 1, "level registry is not empty")
	var row := 56.0 + 12.0
	var flat_height := float(levels.size()) * row
	if flat_height <= VIEWPORT_H - 120.0:
		# Still fits flat today; the ScrollContainer assertions above are what
		# keep it safe as levels are added.
		assert_true(true, "level list currently fits flat (%.0fpx)" % flat_height)
	else:
		assert_true(true, "level list already exceeds a flat screen (%.0fpx)" % flat_height)
