extends RefCounted
class_name BrandTheme
## The project's Theme resource, built from the active palette.
##
## This codebase is a port, and it arrived styling every control with per-node
## add_theme_*_override calls - which is how the framework it came from works,
## not how Godot does. The visible cost was anything nobody remembered to style:
## the login name field and PIN box were plain grey engine defaults sitting on a
## painted sky.
##
## A Theme assigned at a screen's root is the floor every Control inherits.
## Node-level overrides still win, so components that genuinely need their own
## look (BrandButton's three roles, AnswerButton's answer states) are unaffected;
## everything else is on-brand without being told.
##
## Rebuilt when the world changes, cached between times: constructing styleboxes
## per screen is exactly the kind of work Godot expects to happen once.
##
## brand/BRAND_SYSTEM.md §6 (Fixed Nine), §7 (typography).

const FIELD_CORNER := 12
const FIELD_PAD := 14
const FIELD_MIN_HEIGHT := 56
const PANEL_PAD := 22
const FOCUS_RING_WIDTH := 4
const FOCUS_RING_OUT := 4

static var _cached: Theme = null
static var _cached_for := ""

## The theme for the active world, building it if the world has changed.
static func get_theme() -> Theme:
	var id := ThemeManager.get_theme_id()
	if _cached != null and _cached_for == id:
		return _cached
	_cached = _build()
	_cached_for = id
	return _cached

## Assign to a screen root. Children inherit unless they override.
static func apply(root: Control) -> void:
	root.theme = get_theme()

static func _build() -> Theme:
	var theme := Theme.new()
	var ink := ThemeManager.get_color_value("ink")
	var paper := ThemeManager.get_color_value("paper")

	# Labels default to paper with an ink shadow. These screens sit on painted
	# skies now, and unshadowed light text borrows its contrast from whichever
	# world happens to be behind it (§8.6b).
	theme.set_color("font_color", "Label", paper)
	theme.set_color("font_shadow_color", "Label", ink)
	theme.set_constant("shadow_offset_x", "Label", 2)
	theme.set_constant("shadow_offset_y", "Label", 2)
	theme.set_font_size("font_size", "Label", 22)

	# Text fields: paper card, ink text, same shape language as an answer option.
	var field := _field(paper, ink)
	theme.set_stylebox("normal", "LineEdit", field)
	# A RING THAT CAN BE SEEN ON THE FIELD IT IS ON.
	#
	# This was `_field(paper, focus, 4)` -- the `focus` palette role, which is
	# #FFFFFF because every other thing that takes focus in this game sits on ink
	# or on a coloured fill. A text field is PAPER (#FFF8E7), so a white ring on
	# it is a white ring on white: the login form gave a keyboard player no way
	# at all to tell which of its fields they were typing into, which is the
	# whole question when the form is a name and two PINs.
	#
	# Godot draws `focus` ON TOP of `normal` for a LineEdit, so this is an outer
	# halo rather than a replacement: transparent inside, coin-yellow, and pushed
	# out past the field's own ink outline, which stays. Coin because that is
	# already what this game colours "the thing you are on".
	theme.set_stylebox("focus", "LineEdit", _focus_ring(ThemeManager.get_color_value("coin")))
	theme.set_stylebox("read_only", "LineEdit", _field(paper.darkened(0.15), ink))
	theme.set_color("font_color", "LineEdit", ink)
	theme.set_color("font_placeholder_color", "LineEdit", Color(ink, 0.5))
	theme.set_color("caret_color", "LineEdit", ink)
	theme.set_color("selection_color", "LineEdit", Color(ThemeManager.get_color_value("coin"), 0.6))
	theme.set_font_size("font_size", "LineEdit", 26)
	theme.set_constant("minimum_character_width", "LineEdit", 8)

	# Panels default to the ink card used by the pause menu and the medals.
	var panel := StyleBoxFlat.new()
	panel.bg_color = Color(ink, 0.86)
	panel.set_corner_radius_all(20)
	panel.set_border_width_all(3)
	panel.border_color = Color(paper, 0.45)
	# Breathing room INSIDE the card. Without it a PanelContainer draws its
	# border hard against its content, and the session recap on the main menu
	# shipped with "Great flying!" touching the edge of the box it was in.
	panel.content_margin_left = PANEL_PAD
	panel.content_margin_right = PANEL_PAD
	panel.content_margin_top = PANEL_PAD * 0.75
	panel.content_margin_bottom = PANEL_PAD * 0.75
	theme.set_stylebox("panel", "PanelContainer", panel)

	return theme

## Drawn over a field's own face, not instead of it: no fill, and pushed outward
## so the ink outline underneath is still the field's edge.
static func _focus_ring(colour: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(colour, 0.0)
	box.set_corner_radius_all(FIELD_CORNER + FOCUS_RING_OUT)
	box.set_border_width_all(FOCUS_RING_WIDTH)
	box.border_color = colour
	box.set_expand_margin_all(FOCUS_RING_OUT)
	return box

static func _field(fill: Color, border: Color, width := 3) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.set_corner_radius_all(FIELD_CORNER)
	box.set_border_width_all(width)
	box.border_color = border
	box.content_margin_left = FIELD_PAD
	box.content_margin_right = FIELD_PAD
	box.content_margin_top = FIELD_PAD * 0.5
	box.content_margin_bottom = FIELD_PAD * 0.5
	return box
