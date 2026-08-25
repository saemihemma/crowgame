# The Concept Ladder And Its Lessons

Status: Current
Authority: Runtime code and data, specifically `godot/data/curriculum/concept_ladder.json`, `godot/data/curriculum/tutorials.json`, `godot/scripts/math/concept_ladder.gd`, `godot/scripts/systems/tutorial_manager.gd` and `godot/scripts/ui/math_tutorial.gd`. `tools/validate_math_concepts.mjs` is the enforcing authority, and it checks this document too.
Last verified against code: 2026-08-25

## Purpose

This document explains how Hörmann groups its maths, and how it teaches each
group before asking about it.

What this is:
- the grouping layer between a curriculum step and a teachable idea
- the lesson format, and why it has the four beats it has
- where to change the words, the pictures, the numbers and the layout
- the current, generated answer to "what maths is missing"

What this is not:
- not the adaptive difficulty model (that is
  [MATH_SYSTEM_ARCHITECTURE.md](../MATH_SYSTEM_ARCHITECTURE.md))
- not the authoring pipeline for problems themselves (that is
  [MATH_AUTHORING_PIPELINE.md](./MATH_AUTHORING_PIPELINE.md))

## The problem this solves

The learner model has always known how **hard** a problem is. `curriculumStep`
is a number from 0 to 36 per domain, and every selection lane, promotion and
demotion is expressed in it.

It has never known what that number **means**. Step 6 and step 9 are both
"addition", and so is step 30. To the runtime, a child meeting `68 + 5` for the
first time is doing the same thing they were doing at `2 + 1`, only with a
larger number attached. So the moment where a genuinely new idea arrives —
carrying, bridging past ten, place value — was invisible, and nothing could be
triggered by it.

There was exactly one teaching moment in the game: `math_challenge_component.gd`
demonstrates a worked example the first time a child ever touches a domain.
Once per domain, ever. It cannot help the child who has done four hundred
additions and is about to meet their first two-digit sum.

The concept ladder is the missing layer, and it is data.

## The ladder

`godot/data/curriculum/concept_ladder.json` groups every domain's steps into
contiguous ranges. Each range is one teachable idea, with an id, the authored
skills it covers, and the lesson it opens with.

Two rules the build enforces:

- **Contiguous from step 0.** A step no concept claims is a step nothing can
  teach, so ranges may not leave holes between them. Where the ladder has a rung
  with no problems on it, that is declared (see below) rather than skipped.
- **Nothing outside it.** Every authored problem in every pool must fall inside
  exactly one concept.

### Addition

| Concept | Steps | The idea |
| --- | --- | --- |
| `addition.count_all` | 0-2 | Adding is putting two groups together and counting them all. |
| `addition.count_on` | 3-5 | You already know how many are in the first group. Start there and count on. |
| `addition.make_ten` | 6-9 | Every number has a partner that fills the ten-frame. Bonds to ten. |
| `addition.teen_numbers` | 10-14 | A teen number is a ten and some ones. The ten stays put. |
| `addition.bridge_ten` | 15-19 | Getting to the next ten, and asking how far away it is. |
| `addition.tens_and_ones` | 20-29 | Add the ones, keep the tens. Place value doing work. |
| `addition.carrying` | 30-36 | When ten ones become a new ten: stop at the ten on the way. |
| `addition.multi_digit` | 37-46 | Hundreds and thousands: the same two moves, in wider columns. |

Six concepts sit on addition and subtraction as **overlays** rather than rungs.
They claim problems by authored skill, not by step, so they share the step ranges
of the rungs above rather than owning any of them -- see **Overlays** below.

| Overlay | Spans | Claims | The idea |
| --- | --- | --- | --- |
| `addition.missing_part` | 2-9 | `missing_addend` | The unknown is a PART, not the result. Count up inside the whole to find it. |
| `addition.balance` | 2-12 | `relational_equals` | The whole can be written first. `=` means both sides are the same amount. |
| `subtraction.missing_part` | 3-11 | `missing_subtrahend` | How many went. Count back to the amount that is left, and the hops are the answer. |
| `subtraction.start_unknown` | 6-13 | `missing_minuend` | How many there were to begin with. Put the part that went back on -- the hardest CGI tier. |
| `subtraction.balance` | 4-13 | `subtraction_relational` | The answer written first: `5 = 12 - ?`. |
| `addition.both_sides` | 3-9 | `both_sides_equals` | An operation on BOTH sides. The form that separates `=` as a relation from `=` as an instruction. |

### Overlays

A rung answers "how hard is this". An overlay answers "what kind of thing is
this", and the two are genuinely different axes.

`5 + ? = 8` is exactly as hard as `5 + 3 = 8` — the same bond, asked from the
other end — and the pipeline derives it onto the same rung, correctly. But it is
not the same *idea*, and on step alone it would be handed the make-ten lesson,
which teaches nothing about where an unknown can sit. So a concept may declare
`"requires": {"skill": "..."}`; `ConceptLadder.overlay_for_problem` is tried
before the step ranges, because an overlay is the more specific claim.

Overlays never claim a step, so the "contiguous from 0" guarantee is untouched.
`tools/validate_math_concepts.mjs` holds them to their own bar instead: an
overlay must claim at least `minPerOverlay` problems, must have a tutorial, must
declare a span its problems actually fall inside, and may not share its skill
with another overlay in the same domain. The guard attributes every problem to a
concept using the same overlay-then-step rule the runtime uses.

The same mechanism is what carrying will use when it gets its own lesson:
`requiresCarry` is populated on 995 problems and spread at 40-50% across *every*
two-digit step, so it has never been expressible as a step range.

### Subtraction

| Concept | Steps | The idea |
| --- | --- | --- |
| `subtraction.take_away` | 0-2 | Something goes, and what is left is still countable. |
| `subtraction.count_back` | 3-6 | Start at the big number and walk backwards instead of recounting. |
| `subtraction.bridge_back` | 7-10 | Stop at ten on the way down; ten is easy to think from. |
| `subtraction.teens_back` | 11-16 | Taking a bite bigger than the ones you have. |
| `subtraction.tens_and_ones` | 17-29 | Take from the ones, keep the tens. |
| `subtraction.borrowing` | 30-36 | When the ones run out, break a ten. |
| `subtraction.multi_digit` | 37-46 | The same borrow, across more columns and past zeros. |

### Counting

| Concept | Steps | The idea |
| --- | --- | --- |
| `counting.to_five` | 0-1 | One touch per object, and the last number said is the answer. |
| `counting.to_ten` | 2-3 | A full row is five. Count on from it rather than from one. |
| `counting.ten_and_more` | 4-6 | Past ten: a full frame is a ten, and you count only the overflow. |

### Comparison

| Concept | Steps | The idea |
| --- | --- | --- |
| `comparison.more_or_less` | 0-2 | Taller pile, greater number, further along the line. |
| `comparison.compare_teens` | 3-6 | When the tens match, the ones decide. |
| `comparison.compare_larger` | 7-9 | Longer numbers: count the digits, then compare left to right. |

### Pattern matching

| Concept | Steps | The idea |
| --- | --- | --- |
| `pattern_matching.ab_repeat` | 0-2 | Two things taking turns. Find the part that repeats. |
| `pattern_matching.longer_core` | 3-5 | Three things taking turns; track where you are in the repeat. |
| `pattern_matching.tricky_core` | 6-7 | Numbers that do not climb evenly. You need the repeat, not the rule. |

### Number sequence

| Concept | Steps | The idea |
| --- | --- | --- |
| `number_sequence.one_more` | 0-2 | Counting, written down with the end missing. |
| `number_sequence.skip_two` | 3-4 | Measure the gap once, then take it again. |
| `number_sequence.bigger_jumps` | 5-6 | Same move, longer stride. |
| `number_sequence.big_skips` | 7-9 | Small jumps inside big numbers, straight past a hundred. |

### Multiplication

| Concept | Steps | The idea |
| --- | --- | --- |
| `multiplication.groups_of` | 0-7 | Equal groups. The times sign means "groups of". |
| `multiplication.tables_small` | 8-12 | Counting in fives and sixes beats counting in ones. |
| `multiplication.tables_large` | 13-14 | Lean on a fact you know to reach one you do not. |

### Division

| Concept | Steps | The idea |
| --- | --- | --- |
| `division.sharing` | 0-8 | Sharing fairly. The same picture as multiplication, read backwards. |
| `division.tables` | 9-14 | Every division is a multiplication you already know. |
| `division.larger` | 15-15 | Stop counting, start asking which fact fits. |

## The lesson

Every concept opens with the same four beats, one tap each. They are in this
order because that is the order the evidence supports for a novice — see
**Why it is shaped like this** below.

| Card | Stage | What is on screen |
| --- | --- | --- |
| `see` | concrete | The idea as objects. No symbols yet. |
| `model` | pictorial | The same idea in the model that carries it: ten-frame, number line, base-ten rods, equal groups. |
| `worked` | abstract | The equation, already solved, with the reasoning stated. In the eleven lessons with no equation to state — counting, comparison, patterns, sequences — it is the same picture again with the reasoning stated, and that is a shape rather than a CRA claim. See **Why it is shaped like this**. |
| `try` | guided | One question, with the picture still on screen. The child acts. |

Then the owl asks the real question, as a freebie: a win records normally, a
miss records nothing at all.

Three promises the code keeps, each with a test:

- **A lesson never touches the learner model.** No `math_problem_presented`, no
  `math_answer_submitted`, no `math_challenge_complete`, no ELO, no step change.
  A child cannot be marked down for a lesson.
  (`test_math_tutorial.gd::test_a_lesson_never_touches_the_learner_model`)
- **A child can always leave.** Skip is on every card, including the first.
  (`test_skip_is_available_on_the_very_first_card`)
- **A lesson is offered once.** Skipping counts as seen — a Skip button that
  re-offers the lesson tomorrow is a Skip button that lies. The `skipped` flag
  survives in the save so a grown-up surface can tell "was taught" from "chose
  to skip". (`test_concept_ladder.gd::test_a_lesson_is_offered_once_and_then_never_again`)

### When it fires

`math_challenge_component.gd` asks twice:

1. **First contact with a whole domain.** The existing teaching window's
   trigger, upgraded: where the ladder has a lesson for the rung the child
   starts on, that lesson replaces the silent worked-example demo. The demo
   remains the fallback for a rung with no lesson authored.
2. **A new rung inside a domain the child already knows.** After the problem is
   selected, keyed off *that problem's* `curriculumStep`, not the learner's —
   the comfort and stretch lanes routinely hand out a problem a rung either side
   of where the ladder says the child is, and a lesson keyed off the learner
   would teach the wrong idea a third of the time.

The selected problem is held across the lesson and asked afterwards, so the
child gets the question they were just taught rather than whatever the selector
would pick a second later.

## Where to change things

| I want to change… | Edit |
| --- | --- |
| what a lesson says | `godot/data/i18n/strings_en.json` + `strings_is.json`, keys `tutorial.<id>.<card>` |
| the numbers in a lesson's pictures | `godot/data/curriculum/tutorials.json` |
| which steps a concept covers | `godot/data/curriculum/concept_ladder.json` |
| the layout, spacing, pacing or type sizes | `godot/data/tuning/tutorial_tuning.json`, `layout` and `pacing` |
| the colours | `tutorial_tuning.json`, `roles` — each drawn part names a palette role, and each theme supplies it |
| how a representation is drawn | `godot/scripts/ui/components/tutorial_visual.gd` |
| add an eleventh representation | one entry in `RENDERERS` and one `_draw_` function. Nothing else knows the list. |

**There are no numbers, colours or strings in the tutorial scripts that a
designer cannot move from data.** That is deliberate: the lessons exist now so
that a UI/UX pass has something to polish, and the polish should not require
touching GDScript.

To see what a change did, render the whole set:

```bash
bash godot/tools/capture_tutorials.sh                   # 120 cards, English
bash godot/tools/capture_tutorials.sh --locale=is       # 120 cards, Icelandic
bash godot/tools/capture_tutorials.sh --theme=sugarstorm addition.make_ten
```

PNGs land in `output/tutorial-captures/` (gitignored). The lessons are drawn in
code, so a layout or palette change lands on all 120 at once and the contact
sheet is the only honest review. Two things it has already caught: the board
overflowing a 960x540 screen so the Next button sat off the bottom edge, and
`token_c` mapping to `coin` — the same hex as `accent` in the emberwood palette,
which made the second and third slot of every pattern lesson identical.
`test_theme_roles.gd::test_tutorial_pattern_slots_are_distinct_in_every_theme`
now fails the build on the latter.

One constraint to keep in mind when retuning `layout`: the board is budgeted
against the 960x540 design viewport, and `BrandButton` floors every tap target
at 88px on its short edge (Gate B3). Grow `visual_height` or `body_min_h` and
the nav row walks off the bottom of the screen.

The ten representations `tutorial_visual.gd` can draw: `count_all`,
`ten_frame`, `number_line`, `take_away`, `balance`, `pattern_strip`, `numbers`,
`groups`, `tens_and_ones`, `equation`. None of them can draw a **regroup** — ten
ones becoming a ten, or a ten broken back into ones — which is why
`addition.carrying` and `subtraction.borrowing` teach bridging through a landmark
ten on a number line instead of the thing they are named after, and why
`tens_and_ones` may not be given a `takeOnes` larger than its `ones` (the
renderer crosses the units it has and stops, so the drawing and the guard's model
of the drawing would disagree).

## Why it is shaped like this

The four beats are not a house style. Each one is doing a specific job.

**Concrete first, then pictorial, then abstract — where CRA applies.** The CRA
sequence is rated as having strong evidence in the IES What Works Clearinghouse
practice guide for mathematics intervention, and a 2025 meta-analysis of CRA
single-case research reports a large overall effect. Two honest limits on that,
because the template is applied to all thirty concepts and the evidence does not
stretch that far. First, the CRA intervention literature is about *procedural*
topics — single-digit operations, place value, regrouping, fractions, algebra —
and largely about learners with mathematics difficulties; there is no CRA
evidence base for pattern-finding, comparison or counting. Second, the pack
already breaks its own template there: `worked` is an `equation` in nineteen of
thirty lessons, but in `counting`, `comparison`, `pattern_matching` and
`number_sequence` it is another instance of the same picture, so eleven lessons
have three concrete-or-pictorial beats and no abstract one. Where CRA is doing
real work is the four addition, four subtraction, three multiplication and three
division lessons. Elsewhere the four beats are a consistent shape, which is
worth having, and not a claim about evidence.
([meta-analysis](https://journals.sagepub.com/doi/10.1177/09388982241292299),
[PaTTAN practitioner guide](https://www.pattan.net/getmedia/9059e5f0-7edc-4391-8c8e-ebaf8c3c95d6/CRA_Methods0117),
[Edutopia summary](https://www.edutopia.org/article/using-cra-framework-elementary-math/))

**A worked example before a problem.** The worked-example effect — novices learn
more from studying a solved problem than from attempting an equivalent unsolved
one — is one of the most replicated findings in cognitive load theory, because
unguided problem-solving spends working memory on search rather than on the
principle. The third card is always the solved case.
([Sweller, 20 years later](https://link.springer.com/article/10.1007/s10648-019-09465-5),
[NSW CESE research summary](https://education.nsw.gov.au/content/dam/main-education/about-us/educational-data/cese/2017-cognitive-load-theory.pdf),
[example-problem pairs](https://www.sciencedirect.com/science/article/abs/pii/S0361476X1000055X))

**Then hand over, once.** What the fourth card and the owl's question form is an
*example-problem pair*: study one solved case, then do one, then do one with no
picture. Called by its right name, because the fading literature distinguishes
that from what it actually recommends — Atkinson, Renkl and Merrill found that
successively fading worked-out solution steps beats example-problem pairs on near
transfer, and pairs are the control condition rather than the treatment. The
reason this pack stays on the pair is that fading needs multi-step solutions to
fade steps out of, and a lesson whose answer is one number has no intermediate
steps to withhold. If these lessons ever grow a multi-step beat, backward fading
is the change to make, and `validate_math_concepts.mjs` currently forbids it: it
fails any tutorial that asks a question before the last card. That guard is
right for today's four-card shape and is the first thing to revisit, not a law.
([Atkinson, Renkl & Merrill 2003](https://asu.elsevierpure.com/en/publications/transitioning-from-studying-examples-to-solving-problems-effects-/),
[fading and working memory, 2026](https://bpspsychub.onlinelibrary.wiley.com/doi/full/10.1111/bjep.12781))

**The number line is the most-used model and the least-supported one here.** It
is the `model` beat in fifteen of thirty lessons and appears on twenty-four of
the 120 cards, which makes it the pack's default picture. The best available
kindergarten comparison found the opposite of a default: counting training
improved arithmetic, counting and symbolic number-line estimation, while number
line training produced no such gains, and young children struggle with the line
because its points are dimensionless and they need units they can count. The
ten-frame and the object rows are the better-supported models at 5-7, and the
number line's honest job here is the *bridging* lessons, where the landmark ten
is the thing being taught. Where it is standing in for a counting model — the
first subtraction lesson, `number_sequence.one_more` — it is a candidate for
replacement rather than a settled choice.
([counting vs number line training in kindergarten](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.00975/full))

**Both directions of a comparison, and no tappable answer position.** Forty-two
per cent of the comparison pool asks for the *smaller* number, and both
comparison lessons used to only ever model and ask "greater" — while the
`balance` visual highlighted the greater tower on every card, which on a question
card meant highlighting the answer. A balance card now declares `ask` ("more" or
"fewer"), which selects the direction and turns the highlight off, and the guard
requires it on any balance question and forbids it on any statement.
Separately: the guided try is a row of buttons in the authored order, and it used
to be sorted ascending with the answer in the middle in twenty-five of the
twenty-eight three-option lessons. A child who always tapped the middle button
scored twenty-five of twenty-eight and got the full celebration each time, having
done no arithmetic. Positions are now spread and the guard caps any single slot,
because a fixed answer position is a strategy that beats doing the maths.

**Ten-frames and equal groups, not decoration.** Subitizing — seeing a small
quantity without counting it — is among the strongest early predictors of later
mathematics achievement, and the five-and-five ten-frame is the standard
representation for building it, because it makes seven read as "five and two"
rather than as seven things to count. The same frame then shows bonds to ten as
empty cells, which is why `make_ten` and `bridge_ten` use it rather than a
number line.
([subitizing](https://thirdspacelearning.com/us/blog/what-is-subitizing/),
[ten frames](https://thirdspacelearning.com/us/blog/ten-frame/),
[part-part-whole](https://www.mathcoachscorner.com/2014/12/number-bonds-and-partwhole-thinking/))

**Skip on every card, and no reward for sitting through it.** Self-determination
theory identifies autonomy and competence as the two needs game-based learning
most reliably supports, and the practical finding is that autonomy means having
weight in the decision, not unlimited freedom. A lesson a child cannot leave
teaches them that the owl talks at them, and the next one gets tapped through
without reading. Nothing about skipping is punished, and nothing about watching
is paid — the coins are on the maths, where they belong.
([SDT in game-based learning](https://www.frontiersin.org/journals/virtual-reality/articles/10.3389/frvir.2022.847120/full),
[need-supporting scaffolded design](https://www.sciencedirect.com/science/article/pii/S2666557323000095))

This sits on top of what the game already does for motivation, and does not
duplicate it: the golden-problem roll is seeded rather than random-on-demand,
the comeback beat celebrates a corrected miss harder than an ordinary win, and
the session recap ends on the best moment. Those are in
[MATH_SYSTEM_ARCHITECTURE.md](../MATH_SYSTEM_ARCHITECTURE.md).

The Icelandic curriculum for this age band is the practical scope check:
first-year pupils work on number sense, writing the numerals 0-20, and meeting
addition and subtraction within that range — which is exactly where the owl-safe
path sits today, with its operand cap of 20.
([aðalnámskrá](https://www.adalnamskra.is/grunnskoli/kafli-25-staerdfraedi-2024))

## What maths is missing

`tools/validate_math_concepts.mjs` regenerates
`reports/math-concepts/coverage.json` on every `npm run validate`, and fails the
build on an **undeclared** empty or thin rung — and equally on a declared one
that has since been filled. A gap can only be closed by deleting its entry, and
a new one can never appear quietly.

Every gap and every unreachable concept below is quoted from its declaration in
`concept_ladder.json`. `tools/validate_math_concepts.mjs` checks that this
document carries each reason, so the two cannot drift apart.

Note the distinction the list draws, because it changes what the fix is: some
rungs are **unauthored** and can be filled by writing problems, and some are
**structurally impossible** — no fact inside the age band derives onto them, so
only changing the step derivation would close them. The second kind is harmless,
and a test rather than an assertion says so.

**Rungs with no problems authored on them**

- **`addition` step 20.** STRUCTURALLY IMPOSSIBLE, not unauthored. No fact whose operands and result stay inside twenty derives onto step 20 at all: the rung needs maxOperand 20 WITH a carry, and 20's ones digit is zero, so no second addend can carry into it. Harmless because promotion scans ahead for a rung with content and lands on 21 - asserted by test_concept_ladder.gd::test_promotion_can_step_over_every_impossible_rung. Closing it would mean changing the step derivation, not authoring problems.
- **`addition` steps 37, 38, 39, 40.** The gap between two-digit and multi-digit addition. Step 21 upward is magnitude-derived (21 + floor((maxOperand-21)/5)), so these four rungs are operands 101-120 - three-digit sums below 121 - and the multi-digit batches start at 121. Out of the owl path either way, since the operand cap is 20.
- **`subtraction` steps 17, 18, 19, 20.** STRUCTURALLY IMPOSSIBLE, not unauthored - the same finding as addition step 20, four rungs wide. Zero facts with operands and result inside twenty derive onto steps 17-20; everything that would reach them needs operands above 20, which the owl's cap drops anyway. Promotion steps from 16 straight to 21, well inside promotionStepScanLimit, and a test asserts it. This was previously recorded as authoring debt. It is not.
- **`subtraction` steps 37, 38, 39, 40.** The same magnitude gap as addition, for the same reason: the multi-digit batches begin above operand 120 and nothing fills 101-120.
- **`number_sequence` step 0.** The ladder's own first rung. Sequences start at step 1, so the gentlest possible sequence - counting on from a single number - has never been authored.
- **`multiplication` step 11.** One rung inside the tables, skipped by the batch bands. The neighbours are dense (steps 10 and 12 both hold problems), so a promotion through 11 lands on content; it is a hole in the inventory rather than in a child's path.
- **`division` step 0.** Division's first rung. Sharing into a single group is trivially true and arguably not worth authoring, but nothing has decided that on purpose.
- **`division` steps 7, 12.** Two rungs the batch bands step over. Both have dense neighbours, so like multiplication step 11 these are inventory holes rather than breaks in a child's progression.

**Rungs with fewer than six problems**

- **`addition` step 0.** Five problems: 0+1, 1+0, 1+1 and their wordings. The set of true facts with both operands at most one is genuinely almost this small.
- **`subtraction` step 2.** Five problems. Narrow but serviceable.
- **`subtraction` step 15.** Three facts exist and three is the ceiling: 20-0, 20-10 and 20-20 are the only subtractions inside twenty that derive onto step 15. One is authored. Structurally thin rather than under-authored.
- **`number_sequence` steps 1, 3.** Two problems each. The first +1 and first +2 sequences are the two thinnest rungs a child actually meets.

**Concepts no child can currently be served**

The owl caps `maxOperand` at 20 -- the age band, documented at the line that
sets it in `math_challenge_component.gd`. These concepts have authored content
that the cap drops entirely:

- **`addition.tens_and_ones`.** Every problem from addition step 21 up has an operand above 20, so the owl's cap drops all 445 of them. A child tops out at addition.bridge_ten.
- **`addition.carrying`.** Same cap, one concept further on. Nothing in steps 30-36 has an operand at or below 20.
- **`subtraction.tens_and_ones`.** Steps 17-20 have no problems at all and steps 21-29 are all above the operand cap, so the concept is empty on both counts. A child tops out at subtraction.teens_back.
- **`subtraction.borrowing`.** Same cap as its neighbour. Nothing in steps 30-36 has an operand at or below 20.
- **`addition.multi_digit`.** Every problem here has an operand between 121 and 4788 and the owl caps at 20. Authored for a wider audience than the owl currently serves; carries tutorial: null on purpose, because a lesson for content no child can reach is waste.
- **`subtraction.multi_digit`.** Same as addition.multi_digit: operands far above the cap, tutorial deliberately absent.

## What is not on the ladder at all

Named here because an absence nobody wrote down is indistinguishable from a
decision, and these are decisions:

- **Relational equals — now present across both operations.** Six overlays teach
  it: the whole written first (`8 = 5 + ?`, `5 = 12 - ?`), the unknown inside the
  sum (`5 + ? = 8`, `12 - ? = 5`), the start unknown (`? - 3 = 9`), and an
  operation on **both** sides (`4 + 3 = ? + 5`) — the form Falkner, Levi and
  Carpenter actually tested, where a child reading `=` as "compute" answers 7 and
  every kindergartener in their study did. 66 authored problems, all inside the
  owl's operand cap. Still absent: nothing exceeds a total of twenty, and
  multiplication and division have no relational form.
  ([Falkner, Levi & Carpenter 1999](https://eric.ed.gov/?id=EJ600209))
- **Missing addend — now present for both operations.**
  `addition.missing_part` and `subtraction.missing_part` cover Join and Separate
  Change Unknown; `subtraction.start_unknown` covers Start Unknown, the top of
  the CGI ordering for this band. Result Unknown is still the only shape above a
  total of twenty.
  ([CGI problem types by difficulty](http://www.langfordmath.com/ECEMath/CGI/DifficultyText.html))
- **Compare as a problem type.** The `comparison` domain compares two numerals.
  It never compares two sets and asks the difference, which is the mid-tier CGI
  Compare Difference Unknown. Unchanged.
- **Subitizing as its own rung.** The ten-frame is justified by subitizing, and
  `counting.to_five` says "after a while you will see five without counting it at
  all" — but no concept, lesson or problem ever asks a child to see a quantity
  without counting it. Clements and Sarama treat conceptual subitizing as
  instructable; here it is an aside in one card. Unchanged.
- **Zero and identity, and commutativity.** `addition.count_on` *instructs*
  "start at the bigger number and count on", which is only valid because addition
  commutes, and that is never said. The pool holds `1 + 3` and `3 + 1` as
  separate problems. Nothing anywhere says adding zero changes nothing.
  Unchanged.
- **Numeral formation** is correctly absent: this is a tap-only game.

What the decomposition gets right and should not be disturbed: `pattern_matching`
covers repeating patterns and `number_sequence` covers arithmetic growing
sequences, which is the split the patterning literature supports — unit-of-repeat
work is the thing that predicts later success with growing patterns rather than a
lesser version of it.
([Papic, Mulligan & Mitchelmore](https://researchers.mq.edu.au/en/publications/assessing-the-development-of-preschoolers-mathematical-patterning/))

Authoring against these gaps is [MATH_AUTHORING_PIPELINE.md](./MATH_AUTHORING_PIPELINE.md);
`roadmap.md` carries them as open work.
