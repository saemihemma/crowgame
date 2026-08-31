extends Control
class_name StatBar
## One subject, as a bar a parent can read without reading.
##
## WHY A BAR AND NOT THE SENTENCE IT REPLACES. The report used to say each
## subject as a line of coloured text: "Taking away: 31 of 49 right (63%)". Eight
## of those in a column is eight percentages to hold in your head, and the owner's
## complaint about this screen was exactly that -- they wanted to see "good in
## pluses, struggles in minuses", which is a COMPARISON, and a column of numbers
## is the one shape that makes comparison work. Bars of different lengths do it
## at a glance; that is the whole reason bars exist.
##
## WHAT THE PARTS MEAN, and each is a different question:
##   - the FILL's length is how much of this subject the child gets right first
##     go. This is the number that says where to help.
##   - the TRACK behind it is the whole subject, so an eighth-full bar and a
##     nearly-full bar are being compared over the same distance.
##   - the COLOUR is the same three-band verdict the report has always used
##     (good / working on it / a good place to help), so a parent who has read
##     this screen before already knows what amber means.
##   - the COUNT on the right is the sample. 100% of two questions is not a
##     strength, and a bar alone would say it was.
##
## Deliberately drawn rather than assembled out of Panels: the fill is a fraction
## of the track's width, and expressing that as stretch ratios means a subject at
## 0% has a child node of zero size, which Godot lays out in ways that are not
## worth arguing with.

const HEIGHT := 30.0
const CORNER := 8.0
const LABEL_WIDTH := 250.0
const COUNT_WIDTH := 170.0
const GAP := 12.0
## Kept clear on the right. The report scrolls, and a right-aligned tally drawn
## to the full width is printed underneath the scrollbar.
const RIGHT_GUTTER := 14.0
## Nothing is ever drawn at zero length: a subject the child gets none of right
## still has to be visibly a bar with nothing in it rather than an empty row that
## reads as missing data.
const MIN_FILL := 4.0

var subject := ""
var correct := 0
var attempted := 0
## 0..1, or -1 for "not enough answers to say".
var accuracy := 0.0
## Pushed in from the left, for a bar that breaks down the one above it.
var indent := 0.0

static func make(subject_name: String, right: int, total: int, ratio: float) -> StatBar:
	var bar := StatBar.new()
	bar.subject = subject_name
	bar.correct = right
	bar.attempted = total
	bar.accuracy = ratio
	bar.custom_minimum_size.y = HEIGHT
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return bar

## The three-band verdict, shared with the report's text lines so a colour means
## the same thing everywhere on the screen. Thresholds and hexes are data
## (ui_tuning parent_report), not code.
static func colour_for(ratio: float) -> Color:
	if ratio >= float(Config.ui("parent_report/accuracy_good_min", 0.85)):
		return Color.html(String(Config.ui("parent_report/accuracy_color_good", "#2e9e4f")))
	if ratio >= float(Config.ui("parent_report/accuracy_ok_min", 0.70)):
		return Color.html(String(Config.ui("parent_report/accuracy_color_ok", "#c98500")))
	return Color.html(String(Config.ui("parent_report/accuracy_color_low", "#d05353")))

func _draw() -> void:
	var font := get_theme_font("font")
	var font_size := int(Config.ui("parent_report/body_font_size", 22))
	var paper: Color = ThemeManager.get_color_value("paper")
	var ink: Color = ThemeManager.get_color_value("ink")
	var baseline := (size.y + font.get_ascent(font_size) - font.get_descent(font_size)) * 0.5

	draw_string(font, Vector2(indent, baseline), subject,
		HORIZONTAL_ALIGNMENT_LEFT, LABEL_WIDTH - indent, font_size,
		paper if indent == 0.0 else Color(paper, 0.72))

	var track_x := LABEL_WIDTH + GAP
	var track_w := maxf(0.0, size.x - track_x - COUNT_WIDTH - GAP - RIGHT_GUTTER)
	var track := Rect2(track_x, size.y * 0.2, track_w, size.y * 0.6)
	draw_rect(track, Color(ink, 0.55), true)

	if accuracy >= 0.0:
		var fill := track
		fill.size.x = maxf(MIN_FILL, track_w * clampf(accuracy, 0.0, 1.0))
		draw_rect(fill, colour_for(accuracy), true)
	draw_rect(track, Color(paper, 0.35), false, 2.0)

	# The sample, and the percentage it produced. Right-aligned so the numbers
	# line up down the column and can be compared as easily as the bars.
	var tally := TextManager.t("report_bar_count", [str(correct), str(attempted)]) \
		if accuracy < 0.0 else TextManager.t("report_bar_tally",
			[str(int(round(accuracy * 100.0))), str(correct), str(attempted)])
	draw_string(font, Vector2(size.x - COUNT_WIDTH - RIGHT_GUTTER, baseline), tally,
		HORIZONTAL_ALIGNMENT_RIGHT, COUNT_WIDTH, font_size, paper)
