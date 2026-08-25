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

### Subtraction

| Concept | Steps | The idea |
| --- | --- | --- |
| `subtraction.take_away` | 0-2 | Something goes, and what is left is still countable. |
| `subtraction.count_back` | 3-6 | Start at the big number and walk backwards instead of recounting. |
| `subtraction.bridge_back` | 7-10 | Stop at ten on the way down; ten is easy to think from. |
| `subtraction.teens_back` | 11-16 | Taking a bite bigger than the ones you have. |
| `subtraction.tens_and_ones` | 17-29 | Take from the ones, keep the tens. |
| `subtraction.borrowing` | 30-36 | When the ones run out, break a ten. |

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

### Multiplication

| Concept | Steps | The idea |
| --- | --- | --- |
| `multiplication.groups_of` | 0-7 | Equal groups. The times sign means "groups of". |
| `multiplication.tables_small` | 8-12 | Counting in fives and sixes beats counting in ones. |
| `multiplication.tables_large` | 13-18 | Lean on a fact you know to reach one you do not. |

### Division

| Concept | Steps | The idea |
| --- | --- | --- |
| `division.sharing` | 0-8 | Sharing fairly. The same picture as multiplication, read backwards. |
| `division.tables` | 9-14 | Every division is a multiplication you already know. |
| `division.larger` | 15-20 | Stop counting, start asking which fact fits. |

## The lesson

Every concept opens with the same four beats, one tap each. They are in this
order because that is the order the evidence supports for a novice — see
**Why it is shaped like this** below.

| Card | Stage | What is on screen |
| --- | --- | --- |
| `see` | concrete | The idea as objects. No symbols yet. |
| `model` | pictorial | The same idea in the model that carries it: ten-frame, number line, base-ten rods, equal groups. |
| `worked` | abstract | The equation, already solved, with the reasoning stated. |
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
`groups`, `tens_and_ones`, `equation`.

## Why it is shaped like this

The four beats are not a house style. Each one is doing a specific job.

**Concrete first, then pictorial, then abstract.** The CRA sequence is rated as
having strong evidence in the IES What Works Clearinghouse practice guide for
mathematics intervention, and a 2025 meta-analysis of CRA single-case research
reports a large overall effect. Every lesson here starts with objects and ends
with a symbol, in that order.
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

**Then fade the guidance.** Faded worked examples remove support step by step
until the learner is solving unaided, and the expertise-reversal effect says the
support must come off as competence arrives or it becomes redundant. The fourth
card keeps the picture but takes back the answer; the owl's real question keeps
neither.
([fading and working memory, 2026](https://bpspsychub.onlinelibrary.wiley.com/doi/full/10.1111/bjep.12781))

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

Fifteen rungs currently have no problems on them:

- **`addition` step 20.** The bridge from the teens to two-digit addition.
  Nothing generates a sum whose largest operand is exactly 20, so a child
  promoting off step 19 skips straight to 21.
- **`subtraction` steps 17-20.** Four consecutive empty rungs between the teens
  and the twenties — the widest hole in the ladder. A child leaving step 16
  lands on 21 with no intermediate practice at all.
- **`number_sequence` step 0.** The ladder's own first rung. Sequences start at
  step 1, so the gentlest possible sequence — counting on from a single number —
  has never been authored.
- **`multiplication` steps 0, 1, 2, 4.** Multiplication has no foundation rungs.
  Its first authored problem sits at step 3, so the concept opens mid-ladder.
  Out of the owl path today (operand cap 20), which is why it has stayed empty.
- **`division` steps 0, 1, 2, 4, 5.** Same shape as multiplication, one rung
  wider. Sharing into two and three groups — the whole concrete foundation of
  division — is unauthored.

Twelve more are thin (fewer than six problems, which is not enough to give a
child three different questions on the rung the ladder is promoting them
through): `addition` 0, `subtraction` 2 and 15, `number_sequence` 1 and 3,
`multiplication` 3, 5, 11 and 12, `division` 3, 6 and 19. `subtraction` step 15
holds a single problem, `20 - 10`.

The two that matter most for a child playing today are the four-rung subtraction
hole and `addition` step 20, because both sit inside the owl-safe band. The
multiplication and division foundations matter later — those domains are locked
behind unlock rules and the operand cap, so no child currently reaches them.

Authoring against these gaps is [MATH_AUTHORING_PIPELINE.md](./MATH_AUTHORING_PIPELINE.md);
`roadmap.md` carries them as open work.
