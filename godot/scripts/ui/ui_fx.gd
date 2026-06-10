extends RefCounted
class_name UiFx
## Shared UI affordances (port of UINavigator/FocusHighlight + DopamineFX
## entrance helpers, Godot-native).

## Visible focus ring for keyboard/gamepad nav: focused buttons pop slightly
## and brighten (FocusHighlight.ts equivalent on top of Godot's focus system).
static func attach_focus_highlight(button: Button) -> void:
	button.focus_entered.connect(_on_focus.bind(button, true))
	button.focus_exited.connect(_on_focus.bind(button, false))

static func _on_focus(button: Button, focused: bool) -> void:
	if not is_instance_valid(button):
		return
	button.pivot_offset = button.size / 2.0
	var tw := button.create_tween()
	tw.set_parallel(true)
	tw.tween_property(button, "scale", Vector2.ONE * (1.08 if focused else 1.0), 0.12).set_trans(Tween.TRANS_BACK)
	tw.tween_property(button, "modulate", Color(1.15, 1.15, 1.0) if focused else Color.WHITE, 0.12)

## Elastic pop-in for panels/boards (DopamineFX.elasticEntrance equivalent).
static func elastic_entrance(node: Control, duration := 0.3) -> void:
	node.pivot_offset = node.size / 2.0
	node.scale = Vector2.ONE * 0.7
	node.modulate.a = 0.0
	var tw := node.create_tween().set_parallel(true)
	tw.tween_property(node, "scale", Vector2.ONE, duration).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(node, "modulate:a", 1.0, duration * 0.6)
