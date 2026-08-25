extends RefCounted
class_name SpriteSheet
## Sprites by key, resolved from data.
##
## Two files decide what a sprite is. `sprite_spec.json` says what each KIND of
## sprite must be — the pixel law from brand/ASSET_MANIFEST.md, as data the build
## can check. `sprite_registry.json` says only what each individual asset IS: its
## class, path and frame count. Size and anchor come from the class, so changing
## `character` in the spec moves every character sprite together, and a new export
## at a different size is a registry edit rather than a code change.
##
## Callers name a key — `SpriteSheet.texture("owl")` — never a path. That is what
## keeps a `res://assets/**.png` literal out of .gd, which check_assets.py enforces.

## The sprite's own recorded fields, without class defaults applied.
static func raw_entry(key: String) -> Dictionary:
	var sprites: Dictionary = DataManager.get_dict("SPRITE_REGISTRY").get("sprites", {})
	var e: Variant = sprites.get(key, null)
	return (e as Dictionary).duplicate() if e is Dictionary else {}


## Frame size and anchor required of every sprite in `class_name_`.
static func class_defaults(class_name_: String) -> Dictionary:
	if class_name_ == "":
		return {}
	var classes: Dictionary = DataManager.get_dict("SPRITE_SPEC").get("classes", {})
	var c: Variant = classes.get(class_name_, null)
	if not (c is Dictionary):
		push_warning("SpriteSheet: unknown sprite class '%s'" % class_name_)
		return {}
	var out := {}
	for k in ["frameWidth", "frameHeight", "anchor"]:
		if (c as Dictionary).has(k):
			out[k] = (c as Dictionary)[k]
	return out


## Fully resolved entry: the sprite's own fields laid over its class defaults.
static func entry(key: String) -> Dictionary:
	var raw := raw_entry(key)
	if raw.is_empty():
		return {}
	var merged := class_defaults(String(raw.get("class", "")))
	for k in raw:
		merged[k] = raw[k]
	return merged


## Absolute res:// path for `key`, or "" when the key is unknown.
static func path_of(key: String) -> String:
	var e := entry(key)
	if e.is_empty():
		push_warning("SpriteSheet: unknown sprite key '%s'" % key)
		return ""
	return "res://%s" % String(e.get("path", ""))


## Texture for `key`, or null.
##
## A slot marked `optional` is art that has not landed yet — the themed HUD and
## board icons in brand/ASSET_MANIFEST.md Priority 4. Those resolve to their
## declared `fallback` while empty, which is how the game keeps rendering on a day
## the registry names a file nobody has drawn yet.
static func texture(key: String) -> Texture2D:
	var e := entry(key)
	if e.is_empty():
		return null
	var p := "res://%s" % String(e.get("path", ""))
	if ResourceLoader.exists(p):
		return load(p)
	var fallback := String(e.get("fallback", ""))
	if bool(e.get("optional", false)) and fallback != "" and fallback != key:
		return texture(fallback)
	return null


## True when `key` names art that is actually on disk right now.
static func has_art(key: String) -> bool:
	var e := entry(key)
	return not e.is_empty() and ResourceLoader.exists("res://%s" % String(e.get("path", "")))


## SpriteFrames for `key`, using the grid/fps/loop/anim the registry records.
## Returns an empty SpriteFrames carrying the animation name when the art is
## missing, so callers can still play() without a null guard.
static func frames(key: String) -> SpriteFrames:
	var e := entry(key)
	var anim := String(e.get("anim", "default"))
	var tex := texture(key)
	if tex == null:
		var empty := SpriteFrames.new()
		empty.add_animation(anim)
		return empty
	return build_frames(
		tex,
		int(e.get("frameWidth", tex.get_width())),
		int(e.get("frameHeight", tex.get_height())),
		int(e.get("frames", 1)),
		float(e.get("fps", 0.0)),
		anim,
		bool(e.get("loop", false)),
	)


## Where the frame sits relative to the node origin, derived from the registry.
##
## A literal `offset = Vector2(0, -28)` in a .tscn silently encodes two things at
## once: half the CURRENT frame height, plus any deliberate sink. Swap in art at a
## different frame height and the same number quietly means something else, so a
## good new sprite renders sunk or hovering and the art gets blamed.
##
##   "feet"   -> the bottom edge of the frame lands on the origin
##   "center" -> the frame is centred on the origin
static func anchor_offset(key: String, extra_sink_px: float = 0.0) -> Vector2:
	var e := entry(key)
	if e.is_empty():
		return Vector2.ZERO
	return compute_anchor_offset(
		String(e.get("anchor", "center")), float(e.get("frameHeight", 0)), extra_sink_px)


## The shared world-actor sink (fx_tuning.grounding_sink_px). Player, enemy and
## NPC take it; the door and pickups do not.
static func grounding_sink() -> float:
	return float(Config.fx("grounding_sink_px", 0.0))


## Pure form of the anchor rule: no registry, no nodes, just the arithmetic. Split
## out so tests can drive it at frame heights the project does not ship, which is
## the only way to show the rule is not quietly fitted to today's art.
static func compute_anchor_offset(mode: String, frame_h: float, extra_sink_px: float = 0.0) -> Vector2:
	match mode:
		"feet":
			return Vector2(0.0, -frame_h * 0.5 + extra_sink_px)
		"center":
			return Vector2(0.0, extra_sink_px)
		_:
			push_warning("SpriteSheet: unknown anchor '%s'" % mode)
			return Vector2(0.0, extra_sink_px)


## Grid-slice `texture` into one animation. Prefer frames(key); this is for callers
## that already hold a texture and need a second animation from it. Columns are
## derived from the sheet width, so a horizontal strip (the layout
## brand/ASSET_MANIFEST.md asks new art for) and the square grids the shipped
## crow/coin/door sheets use both read correctly.
static func build_frames(texture: Texture2D, frame_w: int, frame_h: int, count: int, fps: float, anim_name: String = "default", loop: bool = true) -> SpriteFrames:
	var sprite_frames := SpriteFrames.new()
	sprite_frames.add_animation(anim_name)
	sprite_frames.set_animation_speed(anim_name, fps)
	sprite_frames.set_animation_loop(anim_name, loop)
	if texture == null:
		return sprite_frames
	var cols := maxi(1, int(texture.get_width() / frame_w))
	for i in count:
		var at := AtlasTexture.new()
		at.atlas = texture
		at.region = Rect2(float(i % cols) * frame_w, float(i / cols) * frame_h, frame_w, frame_h)
		sprite_frames.add_frame(anim_name, at)
	return sprite_frames
