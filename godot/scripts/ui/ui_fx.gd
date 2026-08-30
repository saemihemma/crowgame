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
	var b := float(Config.fx("focus_brightness", 1.15))
	tw.tween_property(button, "modulate", Color(b, b, 1.0) if focused else Color.WHITE, 0.12)

## Elastic pop-in for panels/boards (DopamineFX.elasticEntrance equivalent).
##
## Returns the tween so a caller that wants to do something AFTER the entrance
## can wait for it instead of starting a second animation on top. Two tweens on
## one property is not a stack, it is a fight: both write every frame and the
## last writer wins, which on the title screen made the prompt flicker between
## fading in and fading out for the first third of a second.
##
## Null under reduced motion, and the node is left in its final state -- visible,
## unscaled. It used to animate regardless, which made this the one helper in
## the file that ignored the preference the other two check.
static func elastic_entrance(node: Control, duration := 0.3) -> Tween:
	if not is_instance_valid(node):
		return null
	if reduced_motion():
		node.scale = Vector2.ONE
		node.modulate.a = 1.0
		return null
	node.pivot_offset = node.size / 2.0
	node.scale = Vector2.ONE * 0.7
	node.modulate.a = 0.0
	var tw := node.create_tween().set_parallel(true)
	tw.tween_property(node, "scale", Vector2.ONE, duration).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(node, "modulate:a", 1.0, duration * 0.6)
	return tw

## Single accessor for the reduced-motion preference so Gate B9 has one place
## to land when the settings screen ships (Phase 6). Everything decorative in
## the HUD asks here before it animates.
static func reduced_motion() -> bool:
	return bool(Config.ui("a11y/reduced_motion", false))

## Confirmation pop for a HUD icon that just changed meaning (an owl freed, a
## coin milestone). Overshoot then settle - §9 says rewards arrive fast and
## leave faster, so the return is longer than the punch but both are under a
## fifth of a second.
static func icon_pop(node: Control, strength := 0.18) -> void:
	if not is_instance_valid(node):
		return
	if reduced_motion():
		return
	node.pivot_offset = node.size / 2.0
	var tw := node.create_tween()
	tw.tween_property(node, "scale", Vector2.ONE * (1.0 + strength), 0.09).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(node, "scale", Vector2.ONE, 0.16).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
