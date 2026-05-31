extends RefCounted
class_name SpriteSheet
## Helper to build SpriteFrames / AtlasTexture frames from a grid spritesheet,
## matching the Phaser BootScene spritesheet definitions (coin 32px 3x3, door
## 88x96 6x6, crow-walk 64px 3x3). Keeps animation setup data-driven & reusable.

static func build_frames(texture: Texture2D, frame_w: int, frame_h: int, count: int, fps: float, anim_name: String = "default", loop: bool = true) -> SpriteFrames:
	var frames := SpriteFrames.new()
	frames.add_animation(anim_name)
	frames.set_animation_speed(anim_name, fps)
	frames.set_animation_loop(anim_name, loop)
	if texture == null:
		return frames
	var cols := maxi(1, int(texture.get_width() / frame_w))
	for i in count:
		var at := AtlasTexture.new()
		at.atlas = texture
		at.region = Rect2(float(i % cols) * frame_w, float(i / cols) * frame_h, frame_w, frame_h)
		frames.add_frame(anim_name, at)
	return frames
