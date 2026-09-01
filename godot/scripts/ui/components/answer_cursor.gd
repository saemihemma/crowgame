extends RefCounted
class_name AnswerCursor
## Left, right, Enter, along a row of answers.
##
## WHY THIS IS NOT GODOT'S FOCUS RING, which is the obvious way to do it and is
## the way that broke the board once already. The focus ring is driven by
## `ui_left`/`ui_right` -- the arrow keys, which are also how the crow walks --
## and by `ui_accept`, which is Enter AND Space, Space also being jump. So the two
## keys the game had just finished teaching a child committed whichever option the
## ring had drifted onto, and the game answered its own first question. Every
## AnswerButton is FOCUS_NONE because of that, and nothing here undoes it.
##
## This is the board's own mark on its own row, moved by the board's own actions:
## `answer_prev`/`answer_next` are Left and Right, `answer_confirm` is Enter and
## the keypad's Enter and deliberately NOT Space. It does not exist until an arrow
## is pressed, so a touch or mouse player -- the overwhelmingly common case --
## sees no mark at all.
##
## SHARED, because there are two of these rows and only one of them had it. The
## maths board grew the cursor when a playtester asked for it on a PC; the LESSON
## card's guided-try, which is the FIRST row of answers any child ever meets,
## kept only the digit keys. On a laptop that card was a wall: arrows did
## nothing, Enter did nothing, and the only key that worked was one nothing on
## screen mentioned. Caught by the screen tour walking into it and stopping.

## Where the mark is standing, as an index into the row, or -1 for "nobody has
## touched an arrow key". -1 is the state a touch player is always in.
var at := -1

## Step the mark along the row, skipping options the board has taken away.
##
## Wraps, because a row of answers has two ends and a seven-year-old holding
## Right down should not silently stop. The first press lands on the leftmost
## option rather than moving from nowhere.
##
## `buttons` is anything with `disabled` and `set_selected` -- an AnswerButton.
## Returns whether the mark actually moved, so the caller can play the sound only
## when something happened.
func move(buttons: Array, step: int) -> bool:
	var count := buttons.size()
	if count == 0:
		return false
	var to := at
	for _i in count:
		to = 0 if to < 0 else posmod(to + step, count)
		if not buttons[to].disabled:
			break
	if to < 0 or to >= count or buttons[to].disabled:
		return false
	set_to(buttons, to)
	return true

func set_to(buttons: Array, to: int) -> void:
	at = to
	for i in buttons.size():
		buttons[i].set_selected(i == to)

## Which option Enter should commit, or -1 for none.
##
## A confirm with no mark is deliberately inert rather than defaulting to the
## first option: the one irreversible action on these screens must never happen
## because a key was leaned on.
func chosen(buttons: Array) -> int:
	if at < 0 or at >= buttons.size() or buttons[at].disabled:
		return -1
	return at
