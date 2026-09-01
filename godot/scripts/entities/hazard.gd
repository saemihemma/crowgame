extends Area2D
## Hazard — reusable spike zone (Godot port of GameScene spawnHazard).
## Invisible collision box sized to the Tiled object; player overlap hurts.
## Visual spikes are drawn as simple themeable triangles (Tier-2: optimized for
## Godot rather than transliterating the spike spritesheet frame-picking).

var _w := 32.0
var _h := 32.0

var _pending := Vector2(32, 32)

@onready var _shape: CollisionShape2D = $CollisionShape2D
@onready var _spikes: Polygon2D = $Spikes

func setup_from_spawn(s: Dictionary) -> void:
	position = Vector2(s["x"], s["y"])
	_pending = Vector2(s.get("width", 32), s.get("height", 32))  # applied in _ready (needs nodes)

func configure(w: float, h: float) -> void:
	_w = maxf(8.0, w)
	_h = maxf(8.0, h)
	var rect := RectangleShape2D.new()
	rect.size = Vector2(_w, _h)
	_shape.shape = rect
	_shape.position = Vector2(_w * 0.5, _h * 0.5)  # box anchored at object top-left
	_draw_spikes()

func _ready() -> void:
	configure(_pending.x, _pending.y)
	body_entered.connect(_on_body_entered)
	# Spikes are drawn as small triangles at the bottom of a zone and they are
	# easy to miss on a tablet held at arm's length. A short attenuation (200px)
	# keeps this a WARNING rather than a soundscape: you hear it about a jump
	# before you are on it, and nowhere else in the level.
	AudioManager.attach_loop("amb_hazard", self)

func _draw_spikes() -> void:
	# Row of triangles along the bottom of the zone.
	var pts := PackedVector2Array()
	var tip := 16.0
	var base := 16.0
	var y0 := _h
	var x := 0.0
	while x < _w:
		pts.append(Vector2(x, y0))
		pts.append(Vector2(x + base * 0.5, y0 - tip))
		pts.append(Vector2(x + base, y0))
		x += base
	_spikes.polygon = pts
	_spikes.color = ThemeManager.get_color_value("spike")

func _on_body_entered(body: Node) -> void:
	if not body.is_in_group("player"):
		return
	var game := _find_game()
	if game != null:
		game.hurt_player()

func _find_game() -> Node:
	var n := get_parent()
	while n != null:
		if n.has_method("hurt_player"):
			return n
		n = n.get_parent()
	return null
