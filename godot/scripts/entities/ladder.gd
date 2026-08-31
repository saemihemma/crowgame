extends Area2D
class_name Ladder
## A climbable ladder: one column of rungs the crow can go up and down.
##
## WHAT IT IS NOT: not a platform. The ladder has NO collision body at all, only
## an overlap zone, so the crow walks straight through it and falls past it
## unless they choose to climb. A ladder that also blocked movement would be a
## wall with a picture on it, and a child would meet it by getting stuck rather
## than by climbing.
##
## THE ART IS ONE TILE, STACKED. `ladder` in sprite_registry.json is a single
## 32x32 rung-and-rails square; a ladder of height N draws N of them. Swap that
## one PNG and every ladder in the game is redrawn -- nothing here names a path,
## a colour, or a pixel.
##
## Climbing itself lives in player.gd, deliberately: this node owns WHERE a
## ladder is, and the crow owns what it does about one. See Player._climb.

const SPRITE_KEY := "ladder"
## The tile grid, from the tileset manifest rather than a literal -- a ladder is
## measured in the same squares the level is built from.
const TILE := 32.0

## How tall this ladder is, in tiles. Set by setup_from_spawn from the level.
var tiles := 3

var _zone: CollisionShape2D

## Level objects are authored as rectangles, whose `y` is the TOP edge -- the
## same convention the player spawn and the enemies use, and the opposite of the
## Tiled tile-objects the NPCs use. A ladder hangs DOWN from its top, which is
## how a ladder is described out loud ("a ladder from here down to the floor").
func setup_from_spawn(s: Dictionary) -> void:
	position = Vector2(float(s["x"]), float(s["y"]))
	var height := float(s.get("height", 0.0))
	tiles = maxi(1, int(round(height / TILE)) if height > 0.0 else int(s.get("props", {}).get("tiles", 3)))

func _ready() -> void:
	add_to_group("ladder")
	# Layer 4: not the world (1) and not the player (2), so nothing collides with
	# it -- only the player's own overlap query finds it.
	collision_layer = 4
	collision_mask = 2
	monitoring = false      # the crow asks us, we do not chase the crow
	monitorable = true

	var texture := SpriteSheet.texture(SPRITE_KEY)
	for i in tiles:
		var rung := Sprite2D.new()
		rung.texture = texture
		rung.centered = false
		rung.position = Vector2(0.0, float(i) * TILE)
		rung.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		add_child(rung)

	_zone = CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	# A tile wide and the full run tall. Narrower than the tile on purpose: the
	# crow has to be ON the ladder to climb it, not merely beside it, or a child
	# running past a ladder sticks to it.
	shape.size = Vector2(TILE * CATCH_WIDTH, float(tiles) * TILE)
	_zone.shape = shape
	_zone.position = Vector2(TILE * 0.5, float(tiles) * TILE * 0.5)
	add_child(_zone)

## How much of the tile's width counts as "on the ladder". Two thirds: wide
## enough that a child aiming for it lands on it, narrow enough that running
## past one at speed does not catch.
const CATCH_WIDTH := 0.66

## The x a climbing crow is pulled onto, so climbing is always dead centre of the
## rungs rather than clinging to one rail.
func centre_x() -> float:
	return global_position.x + TILE * 0.5

## The top of the ladder in world space, which is where climbing stops.
func top_y() -> float:
	return global_position.y

func bottom_y() -> float:
	return global_position.y + float(tiles) * TILE
