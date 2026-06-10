extends Area2D
## Projectile (laser) — Godot port of Projectile.ts. Travels horizontally at
## combat_tuning.laser_speed, expires after crossing the screen, and kills the
## first enemy it overlaps. Detects enemies via collision mask (enemy layer 4).

var _speed := 400.0
var _dir := 1
var _life := 2.0

func setup(dir: int, speed: float) -> void:
	_dir = dir
	_speed = speed
	# Lifetime ~ time to cross the viewport (GAME_WIDTH / speed seconds).
	_life = 960.0 / maxf(1.0, speed)

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	area_entered.connect(_on_area_entered)
	_add_trail()

## Continuous trail behind the beam (Projectile.ts spawns trail dots every 30ms;
## here a single GPUParticles2D emitter rides along — Godot-native equivalent).
func _add_trail() -> void:
	var p := GPUParticles2D.new()
	p.amount = 16
	p.lifetime = 0.25
	p.local_coords = false
	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3(-_dir, 0, 0)
	mat.spread = 12.0
	mat.initial_velocity_min = 20.0
	mat.initial_velocity_max = 60.0
	mat.gravity = Vector3.ZERO
	mat.scale_min = 1.0
	mat.scale_max = 2.0
	mat.color = Color(1.0, 0.55, 0.1, 0.8)
	p.process_material = mat
	add_child(p)

func _physics_process(delta: float) -> void:
	position.x += _dir * _speed * delta
	_life -= delta
	if _life <= 0.0:
		queue_free()

func _on_body_entered(body: Node) -> void:
	_try_hit(body)

func _on_area_entered(area: Area2D) -> void:
	_try_hit(area.get_parent())

func _try_hit(node: Node) -> void:
	if node != null and node.is_in_group("enemy") and node.has_method("kill"):
		node.kill()
		queue_free()
