extends RefCounted
class_name DopamineFX
## Kid-friendly juice (port of DopamineFX) implemented with Godot-native nodes
## (GPUParticles2D + Tween) rather than transliterated Phaser tweens — Tier-2:
## reproduce the feel, optimized for Godot.

## A short burst of colored particles at a world position (e.g. coin pickup).
static func burst(parent: Node, pos: Vector2, color: Color = Color("#ffd700"), amount := 14) -> void:
	if parent == null or not parent.is_inside_tree():
		return
	var p := GPUParticles2D.new()
	p.position = pos
	p.amount = amount
	p.one_shot = true
	p.explosiveness = 1.0
	p.lifetime = 0.5
	p.emitting = true
	var mat := ParticleProcessMaterial.new()
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	mat.emission_sphere_radius = 6.0
	mat.direction = Vector3(0, -1, 0)
	mat.spread = 180.0
	mat.initial_velocity_min = 60.0
	mat.initial_velocity_max = 160.0
	mat.gravity = Vector3(0, 400, 0)
	mat.scale_min = 1.0
	mat.scale_max = 2.5
	mat.color = color
	p.process_material = mat
	parent.add_child(p)
	# Free after the burst finishes.
	parent.get_tree().create_timer(p.lifetime + 0.2).timeout.connect(p.queue_free, CONNECT_ONE_SHOT)

## A celebratory "number fly-up" label (e.g. "+2") at a world position.
static func number_fly_up(parent: Node, pos: Vector2, text: String, color: Color = Color("#ffd700")) -> void:
	if parent == null or not parent.is_inside_tree():
		return
	var l := Label.new()
	l.text = text
	l.position = pos
	l.add_theme_font_size_override("font_size", 28)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_shadow_color", Color.BLACK)
	parent.add_child(l)
	var tw := l.create_tween().set_parallel(true)
	tw.tween_property(l, "position:y", pos.y - 36.0, 0.6).set_trans(Tween.TRANS_QUAD)
	tw.tween_property(l, "modulate:a", 0.0, 0.6)
	tw.chain().tween_callback(l.queue_free)
