extends PanelContainer
class_name LockedDoorCard
## What the door says when the player walks into it with owls still in chains.
##
## This is the one error message in this game that a child will hit over and
## over, and it has to work for a six-year-old who cannot yet read the sentence
## on it. So the sentence is the LAST thing on the card, not the first. Above it,
## in descending order of how fast it lands:
##
##   1. The owl, wearing the chains it is drawn wearing. Somebody is still tied up.
##   2. A row of pips, one per owl the door asks for - gold for freed, hollow for
##      still waiting. Deliberately the same vocabulary as the HUD's owl ring, so
##      the card teaches WHERE the count lives instead of replacing it. The ring
##      pulses at the same moment (EventBus.door_refused) to close that loop.
##   3. One big number: how many are left. This is the only thing on the card a
##      child has to take away from it.
##
## IT IS NOT A FAILURE, and nothing about it is styled like one. No red, no
## buzzer, no "you can't do that": the accent is `notyet` amber - §11 makes "not
## yet" a tense rather than a verdict - and the door plays a soft double knock
## rather than the hurt sound. A child at a locked door has done nothing wrong.
## They arrived early, and the card's whole job is to point them back at the owl.
##
## brand/BRAND_SYSTEM.md §8.2 (pods), §11 (not-yet language). The strings are
## door.locked / door.locked.one; the sound event is door_locked and
## brand/SOUND_DESIGN.md says how it should sound.

const CARD_PAD := 24
const CARD_CORNER := 26
## The owl is drawn at 64px. Upscaled, not shrunk: it is the first thing the eye
## should land on, and the card has room the HUD ring does not.
const OWL_BOX := Vector2(112.0, 112.0)
const OWL_SPRITE_KEY := "owl"
## Above this many owls a row of pips stops being countable at a glance and
## becomes a bar chart, so past the cap the big number carries it alone. Story
## levels hold two or three; this is insurance, not a case anyone hits today.
const PIPS_MAX := 8
const HOLD_SECONDS := 1.7
const FADE_SECONDS := 0.4
## Name on the fitter, so a second refusal replaces the first card instead of
## stacking a second one on top of it at half opacity.
const MOUNT_NAME := "LockedDoorCard"


## Put one up, animate it, take it away again. The caller owns nothing.
##
## Mounted through FitBox because the tightest viewport this game can be given is
## exactly 960x540 and this card is tall - see fit_box.gd for why that is the
## number that matters rather than whatever the current window happens to be.
static func present(layer: CanvasLayer, freed: int, required: int) -> void:
	if layer == null:
		return
	var stale := layer.get_node_or_null(MOUNT_NAME)
	if stale != null:
		# Unparented NOW, then freed. queue_free alone runs at the end of the
		# frame, so the old card is still a child while the new one is added and
		# the player briefly sees two numbers at half opacity - which is worse
		# than saying nothing. remove_child is safe here and free() would not be:
		# this can be reached from inside the door's _process.
		layer.remove_child(stale)
		stale.queue_free()
	var card := LockedDoorCard.new()
	card._freed = freed
	card._required = required
	var fitter := FitBox.around(card)
	fitter.name = MOUNT_NAME
	layer.add_child(fitter)
	UiFx.elastic_entrance.call_deferred(card)
	var tw := card.create_tween()
	tw.tween_interval(HOLD_SECONDS)
	tw.tween_property(card, "modulate:a", 0.0, FADE_SECONDS)
	tw.tween_callback(fitter.queue_free)


var _freed := 0
var _required := 1

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_theme_stylebox_override("panel", _face())

	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 10)
	add_child(col)

	var owl := _owl()
	if owl != null:
		col.add_child(owl)
	if _required <= PIPS_MAX:
		var pips := PipRow.new()
		pips.total = _required
		pips.filled = _freed
		pips.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		col.add_child(pips)

	var still := maxi(0, _required - _freed)

	# The number, alone, enormous. A child who reads nothing else on this card
	# should still walk away knowing "one more".
	var count := Label.new()
	count.text = str(still)
	count.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	count.add_theme_font_size_override("font_size", 80)
	count.add_theme_color_override("font_color", ThemeManager.get_color_value("notyet"))
	count.add_theme_color_override("font_shadow_color", ThemeManager.get_color_value("ink"))
	count.add_theme_constant_override("shadow_offset_x", 3)
	count.add_theme_constant_override("shadow_offset_y", 3)
	col.add_child(count)

	# Icelandic declines the noun after a numeral, so one-versus-many is a
	# separate string rather than a suffix, and the rule is not English's: 21
	# owls takes the singular form in Icelandic and the plural in English.
	# TextManager.tp owns that per-locale rule; `n` names the number driving it.
	var line := Label.new()
	line.text = TextManager.tp("door.locked", {"n": still}, "n")
	line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	line.add_theme_font_size_override("font_size", 24)
	line.add_theme_color_override("font_color", ThemeManager.get_color_value("paper"))
	col.add_child(line)


## Ink plate with an amber rim. Amber and not `danger`: the rim is the loudest
## colour on the card and it must not be the colour the game uses for damage.
func _face() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(ThemeManager.get_color_value("ink"), 0.94)
	box.set_corner_radius_all(CARD_CORNER)
	box.set_border_width_all(4)
	box.border_color = ThemeManager.get_color_value("notyet")
	box.set_content_margin_all(CARD_PAD)
	return box


func _owl() -> TextureRect:
	if not SpriteSheet.has_art(OWL_SPRITE_KEY):
		return null
	var tex := SpriteSheet.texture(OWL_SPRITE_KEY)
	if tex == null:
		return null
	var frame := SpriteSheet.frame_size(OWL_SPRITE_KEY)
	var atlas := AtlasTexture.new()
	atlas.atlas = tex
	atlas.region = Rect2(0, 0, frame.x, frame.y)
	var rect := TextureRect.new()
	rect.texture = atlas
	rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	# Nearest, not the project default: this is the only place the owl is drawn
	# above 1:1, and bilinear upscaling turns pixel art to mush.
	rect.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	rect.custom_minimum_size = OWL_BOX
	rect.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return rect


## One dot per owl the door asks for: gold for freed, an empty socket for waiting.
##
## RINGS, not two shades of dot. The first build drew the waiting ones as a blend
## of owl toward ink, which is what the HUD ring does for its unlit track - but
## the ring's track sits on an ink disc over a BRIGHT WORLD, and here the same mix
## sits on the ink card itself. The first capture of this card
## (output/godot-shots/level_01-door-locked.png) shows two dots at rgb(95,84,73):
## mud, distinct from the card but reading as dead stones rather than as owls
## still waiting. An empty socket has to look empty and still look like a place an
## owl goes, so the outline is the constant and the fill is what changes.
class PipRow extends Control:
	const DOT := 16.0
	const GAP := 12.0
	const RING := 3.0
	## The socket floor: dark, but lifted off the card so a hollow pip is a hole
	## in something rather than a hole in nothing.
	const SOCKET_MIX := 0.86

	var total := 3
	var filled := 0

	func _ready() -> void:
		var count: int = maxi(1, total)
		custom_minimum_size = Vector2(
			count * DOT * 2.0 + (count - 1) * GAP + RING * 2.0,
			DOT * 2.0 + RING * 2.0)
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var owl := ThemeManager.get_color_value("owl")
		var ink := ThemeManager.get_color_value("ink")
		var gold := ThemeManager.get_color_value("coin")
		var socket := owl.lerp(ink, SOCKET_MIX)
		var y := size.y * 0.5
		for i in maxi(1, total):
			var x := DOT + RING + i * (DOT * 2.0 + GAP)
			var lit := i < filled
			draw_circle(Vector2(x, y), DOT, gold if lit else socket)
			# The outline is owl-gold on every pip, lit or not: it is what says
			# "an owl belongs here", and it is the only thing a child has to
			# count. A freed one is that same circle filled in.
			draw_arc(Vector2(x, y), DOT - RING * 0.5, 0, TAU, 28,
				gold if lit else Color(owl, 0.8), RING)
