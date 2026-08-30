extends CanvasLayer
class_name DeathBeat
## The moment after a child loses the crow.
##
## WHAT THIS REPLACED. Two paths, and the one a child actually hits had nothing
## at all. `hurt_player()` with lives remaining teleported the crow back to the
## spawn point mid-stride -- no beat, no sound, no acknowledgement -- and a
## playtester reported exactly that: "death scene, not instant respawn". Only
## running out of lives got anything, and that was an "Oops!" Label built in
## GDScript inside game.gd with its font size, colour, shadow offsets and tween
## all hardcoded, which is why the same note asked for "easily editable".
##
## So it is a scene with its own tuning block, like every other system here. The
## numbers live in data/tuning/fx_tuning.json under `death`, the words live in
## the i18n files, and the layout is this file. Changing how a death FEELS should
## not require reading game.gd.
##
## THREE THINGS IT HAS TO DO, in the order a five-year-old needs them:
##
##   1. Stop. The world freezes, so the last thing that moved was the crow
##      falling and not the camera drifting on afterwards.
##   2. Say what happened, in words, held long enough to be read by someone who
##      is still learning to read.
##   3. Get out of the way. It closes itself and hands control back; nothing
##      waits for a tap, because a tap-to-continue on every miss is a toll.
##
## Deliberately NOT a full-screen scene change. A death that swaps scenes reads
## as a punishment and loses the place; this sits over the frozen level so a
## child can still see where they were standing.

## Emitted once the beat has been held. The caller does the respawn or reload --
## this scene knows nothing about lives, levels or coins.
signal finished

## Which of the two deaths this is. Only the words differ: a stumble with lives
## left is not the same event as losing the last one, and telling a child "you
## ran out" when they have two hearts in the corner is a lie they can see.
enum Kind {STUMBLE, LAST_LIFE}

var _kind: int = Kind.STUMBLE
var _label: Label
var _shade: ColorRect

static func make(kind: int) -> DeathBeat:
	var beat := DeathBeat.new()
	beat._kind = kind
	return beat

func _ready() -> void:
	layer = int(Config.fx("death/layer", 22))
	# The overlay itself keeps running while the world is frozen: it IS the beat,
	# so pausing it would hold a still frame forever.
	process_mode = Node.PROCESS_MODE_ALWAYS

	_shade = ColorRect.new()
	_shade.color = _shade_colour()
	_shade.anchor_right = 1.0
	_shade.anchor_bottom = 1.0
	_shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_shade.modulate.a = 0.0
	add_child(_shade)

	_label = Label.new()
	# Losing the last heart now COSTS something -- this level's coins and owls go
	# back to nothing (SaveManager.forget_level_run) -- and a cost a child cannot
	# see is not a cost, it is a bug they will report. So the last-life beat says
	# what it took, on a second line, in the plainest words the reading budget
	# allows. The stumble says nothing extra, because it takes nothing.
	_label.text = TextManager.t("game.oops") if _kind == Kind.STUMBLE else \
		"%s\n%s" % [TextManager.t("game.out_of_lives"), TextManager.t("game.level_reset")]
	_label.add_theme_font_size_override("font_size", int(Config.fx("death/font_size", 48)))
	_label.add_theme_color_override("font_color", ThemeManager.get_color_value("death_text"))
	_label.add_theme_color_override("font_shadow_color", ThemeManager.get_color_value("text_shadow"))
	_label.add_theme_constant_override("shadow_offset_x", int(Config.fx("death/shadow_offset", 3)))
	_label.add_theme_constant_override("shadow_offset_y", int(Config.fx("death/shadow_offset", 3)))
	_label.anchor_right = 1.0
	_label.anchor_bottom = 1.0
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_label.modulate.a = 0.0
	add_child(_label)

	_play()

## How long the whole beat lasts, from `death.hold_ms`.
##
## A number rather than a boolean because "a death scene" is a duration decision:
## a five-year-old needs longer than an adult to understand what happened, and
## much less before it turns into punishment. Watch a child, not yourself.
static func hold_seconds() -> float:
	return maxf(0.0, float(Config.flag("death/hold_ms", 1200)) / 1000.0)

func _shade_colour() -> Color:
	var c := ThemeManager.get_color_value("overlay_shade")
	c.a = float(Config.fx("death/shade_alpha", 0.55))
	return c

## Fade in, hold, fade out -- and the hold is the part that matters.
##
## The thirds are derived from the one tuned duration rather than tuned
## separately: three more numbers would be three more ways for the beat to stop
## adding up to what `hold_ms` says it is.
func _play() -> void:
	var total := hold_seconds()
	if total <= 0.0:
		# A zero hold is a legitimate setting -- someone who finds the beat
		# punishing should be able to turn it off entirely -- so it must not
		# leave a scene sitting on screen with a zero-length tween.
		finished.emit()
		queue_free()
		return

	var fade := total * 0.2
	var hold := total - fade * 2.0
	var rise := float(Config.fx("death/text_rise_px", 28.0))

	var tw := create_tween().set_parallel(true)
	tw.tween_property(_shade, "modulate:a", 1.0, fade)
	tw.tween_property(_label, "modulate:a", 1.0, fade)
	# The text drifts up across the WHOLE beat, not just the fade: a word that
	# arrives and then sits still reads as a frozen frame rather than a moment.
	tw.tween_property(_label, "position:y", -rise, total).set_trans(Tween.TRANS_QUAD)

	var out := tw.chain()
	out.tween_interval(hold)
	var away := out.chain().set_parallel(true)
	away.tween_property(_shade, "modulate:a", 0.0, fade)
	away.tween_property(_label, "modulate:a", 0.0, fade)
	away.chain().tween_callback(func() -> void:
		finished.emit()
		queue_free())
