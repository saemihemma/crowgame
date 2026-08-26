# The maths experience: user stories and review

Status: Current
Authority: Design intent and the review behind it. Runtime truth lives in the
code this document names.
Last verified against code: 2026-08-26

## What this is

The maths half of Hörmann was built correct-first: a parity-locked learner
model, a 47-concept ladder, 30-odd lessons, an ELO, a review queue. Every piece
works. What nobody had written down is what a **child** is supposed to
experience when they walk into an owl, and the pieces had drifted into
contradicting each other on exactly that question.

This document is that missing layer. Part 1 is the user stories the experience
is now built to. Part 2 is the review that produced them, issue by issue, with
what shipped and what deliberately did not.

Read `ARCHITECTURE.md` for how the maths works, and
`docs/MATH_CONCEPT_LADDER.md` for what it teaches. This is why it feels the way
it does.

---

# Part 1 — User stories

Written from the child's side, because that is the side that was missing. Each
story carries acceptance criteria that are checkable in code, not vibes.

## US-1 — I start where I am, not where everyone starts

> As a child opening the game for the first time, I want my first question to be
> about the maths I am actually doing at school, so that I am neither bored by
> counting to three nor lost in a sum I have never seen.

**Was:** every child started on the same rung — addition step 2, counting step 2,
everything else step 0 — regardless of whether they were four or eight. Birth
year was already collected at login and already mapped to an Icelandic bekkur,
but only the *parent report* used it. The game itself never looked.

**Now:** two mechanisms, in `godot/scripts/math/math_placement.gd`.

1. **The age seed**, once, on a profile's first play. Birth year → bekkur under
   the same rule the parent report uses (Lög um grunnskóla nr. 91/2008, 15. gr.,
   via `godot/data/curriculum/grade_expectations.json`), then bekkur → a starting
   rung per domain, two steps *below* what the grade tables expect that child to
   have finished.
2. **The calibration window**, over the first three answers. Inside it, a
   first-try win moves a whole *concept* rung forward and a miss moves one back,
   so a wrong guess is corrected in about three questions rather than thirty.

Acceptance criteria:

- A child with no birth year on file is placed exactly as before. Not collecting
  it stays free.
- A leikskóli child is seeded nothing. Aðalnámskrá leikskóla defines no
  mathematics criteria, so there is no floor to stand them on.
- Multiplication and division are never seeded for this audience: they are a 3.
  bekkur idea, and `maxOperand: 20` means the content above the seed ceiling is
  unreachable anyway.
- The seed never lowers a rung and never overrides measured play. A returning
  child keeps what they earned.
- The child never sees a test. Placement happens inside ordinary owl encounters.

Pinned by `godot/tests/test_math_placement.gd`.

**Explicitly rejected: a separate placement quiz screen.** `PRODUCT.md` asks for
"playful rather than school-like", and three questions on a screen with no crow,
no owl and no coins is the most school-like thing the game could open with. The
first three owls *are* the placement; they just count for more than the fourth
one does.

## US-2 — I get taught when the maths is new, and reminded when it is only newish

> As a child meeting a harder kind of question, I want to be shown how this kind
> works — once — so that I am not guessing. As the same child on my fortieth
> addition, I do not want to be walked through counting blocks again to be told
> that ten is a thing.

**Was:** a full four-card lesson (objects → model → worked example → guided try)
fired for every one of 47 concepts, at the same length every time, plus a
separate silent demo on first contact with a domain. A concept boundary sits
every 3–5 curriculum steps, so a child in a normal run met the same
four-card-plus-a-question shape over and over.

**Now:** teaching has a depth and a budget.

| Trigger | What the child gets |
|---|---|
| First lesson ever in a **domain** (a new *category*) | FULL — all four cards |
| A new **rung** inside a domain already met | BRIEF — the model picture and the worked example, no guided question |
| A concept the ladder has not reached (stretch-lane problem) | Nothing |
| A second new concept inside the same owl encounter | Nothing — one lesson per owl |

Which cards a brief lesson plays is data (`brief_cards` in
`godot/data/tuning/tutorial_tuning.json`), so this is retunable without code.

Acceptance criteria:

- A brief lesson is strictly shorter than a full one and asks no question of its
  own.
- Depth is derived from *this child's* history, not authored per concept — the
  same rung is a first meeting for one child and a fifth for another.
- A skipped lesson still counts as met. Re-offering a lesson a child declined
  would make the Skip button a lie.
- Skip stays on every card of every depth.
- Nothing in a lesson, at any depth, records an attempt or moves a rung.

Pinned by `godot/tests/test_math_teaching_budget.gd`.

## US-3 — One owl, one question

> As a child walking into an owl, I want to answer a question and get back to
> playing.

`problemCount` was already 1 for the baseline owl. What made an owl feel like
four screens was everything wrapped around the question: a lesson, its guided
try, the freebie, and on first domain contact a silent demonstration as well.

**Now:** an owl is at most `[one lesson] → one question`. The lesson budget in
US-2 is what enforces the "at most one", and the brief depth is what makes the
common case two taps rather than five.

Acceptance criteria:

- No owl encounter opens two lessons.
- The question a lesson leads into is the question the lesson was about, and it
  is a freebie: a miss on the first try at a brand-new idea records nothing.

**Known remainder:** the silent demo path in
`godot/scripts/entities/npc/math_challenge_component.gd` still exists as the
fallback for a rung with no authored lesson. With 47 lessons covering every
domain's opening rung it is close to unreachable in practice, but it is dead
weight and removing it is a behaviour change that wants its own pass (and its
own i18n cleanup — `math.demo_watch` becomes a dead key). Left standing
deliberately rather than half-removed.

## US-4 — Everything speaks good Icelandic

> As an Icelandic child, I want the game to sound like a person talking to me,
> not like a translated worksheet.

The Icelandic is broadly good — 582 keys, plural-aware, CI-locked against the
English. Two distinct problems remain, and they are not the same problem:

1. **Correctness.** `math.demo_watch` had lost every accent
   ("Fylgstu vel med, eg syni ther"). Fixed. This is the only one of its kind
   the sweep found, but nothing in CI would have caught it: the i18n validator
   checks that keys exist in both locales, not that the Icelandic is Icelandic.
2. **Register.** The lesson bodies are written at an adult reading level. The
   card in the screenshot that started this review says:

   > Átta alls. Þú sérð fimm. Spurningarmerkið er restin: þau eru til, þú þarft
   > bara að finna hvað þau eru mörg.

   That is 24 words and a colon-clause, on a card for a six-year-old, next to a
   picture that already says it. **Not fixed in this pass**, and deliberately:
   it is 47 lessons × 4 bodies, it is genuinely a writing job rather than an
   engineering one, and doing forty of them badly is worse than doing none.
   See "What did not ship" below for the proposed shape.

## US-5 — Nothing on the board is unexplained

> As a child reading a question, I want everything on the screen to be part of
> the question.

Two unlabelled dot rows and one stray ring were on screen with no legend:

- **Promotion pips** on the question board — three circles, filled as wins banked
  toward the next rung. **Removed.** A child who decodes them learns that two out
  of three of their answers "do not count", which is the opposite of what the
  ladder means. The step-up is still celebrated, in the HUD banner, where a
  celebration reads without a legend.
- **Lesson progress dots** — kept for a multi-card lesson, where they honestly
  say "two more taps", **hidden on a single-card one**.
- **A single chain link** hovering under most owls. `chainLinks` mirrors
  `problemCount`, and a set of one communicates no size, so it read as debris.
  **Now drawn only at two or more.** The owl sprite is already in chains holding
  a padlock; "locked" never rested on this.

## US-6 — Getting better makes it harder

> As a child who is getting good at this, I want the questions to get harder.

Honest finding: **ELO is not the difficulty system and should not become one.**
`elo_aware_strategy.gd` says so in its own header — the curriculum step drives
selection and ELO is a background signal. Making ELO drive selection would mean
changing Tier-1 kernel behaviour that `math-kernel/**` golden fixtures pin.

The flatness the report describes is real, but its cause is the *starting point*
and the *climb rate at the start*, not the lane mix. US-1 fixes both: a
2. bekkur child now opens around addition step 13 instead of step 2, and the
calibration window moves in concept-sized jumps for the first three answers.

**Deliberately not changed: the lane weights** (40% comfort / 20% review / 30%
at-level / 10% stretch, so 60% of questions sit at or below the current rung).
Two reasons. First, that ratio is the design — `PRODUCT.md`: "success should be
common enough to feel motivating". Second, `laneWeights` is Tier-1: golden
fixtures are generated from it and `tools/validate-content.ts` hashes the file
into the server's `ladderWeights.ts`. Moving it on intuition is exactly what
`roadmap.md`'s ladder-tuning entry exists to prevent — `/api/v1/admin/ladder-tuning`
will name the one knob to move once about 200 answers over four days exist.
**Play first, then move it.**

## US-7 — Answering is quick, and the board is just a board

> As a child who has tapped an answer, I want to know if I was right, now.

- **Correct** took 1.5s to resolve — a full second after the button had already
  gone green, which reads as the game thinking rather than as celebrating. Now
  700ms.
- **The final reveal** (after the second miss) is 2.4s, down from 3s but still
  the longest hold on purpose: that board is *teaching*, and a young reader needs
  the sentence.
- **The retry lockout** stays at 800ms — its floor, not below it.
  `test_answer_feedback.gd` pins it there because it has to outlast the
  wrong-answer tint, the shake and the hint fading in.
- **The camera** no longer moves at all. It used to lift 150px over 0.28s on top
  of a camera that was still settling (position smoothing at 5.0, plus horizontal
  drag margins), which is the sideways drift in the report — and the sideways
  half was never the lift. It now lands on its own target in one frame, under the
  overlay's scrim, and stays there. The board centres on the whole viewport,
  since the lift was the only reason it did not.

## US-8 — The owl always answers

> As a child standing on an owl, I want the question to open.

**Root cause found.** `npc.gd::interact()` set `_interacting = true`, played the
greeting and hid the prompt — and *then* asked the components whether anything
would happen. `math_challenge_component.gd::_launch()` returned bare when the
game node was missing or another overlay was still alive, leaving the owl
flagged mid-encounter forever. In that state its name label hides, the
re-trigger loop in `_process` skips it, and completion events are ignored. The
owl goes permanently quiet and standing on it does nothing, which is exactly the
reported screenshot.

**Fixed by making the commit conditional.** `NpcComponent.on_interact()` now
returns whether it took the encounter; `Npc.interact()` announces nothing until
something has said yes, and a declined offer rolls all the way back and retries
after a short silent backoff.

The obvious smaller fix — call `end_interaction()` on the bail — was tried and
rejected: it arms the ordinary 2s cooldown, so an owl standing next to the one
being answered would re-offer every two seconds and play its greeting each time,
behind somebody else's lesson. Trading a permanently dead owl for a hooting one
is not a fix. The distinction the code was missing is between an encounter that
*ended* and one that never *started*, and that is what the return value is.

## US-9 — The picture stays inside the card

> As a child reading a lesson, I want the picture and the words not to be on top
> of each other.

**Root cause found.** `tutorial_visual.gd::_fit()` scales a drawing to its band
and will scale *up* to 1.6×. `_draw_part_whole` handed it the bar alone — but the
card also draws the whole above the bar, a bracket line, and two part labels
below it. On `addition.missing_part` that put the "8" through the progress dots
and the "5" and the "?" through the body text.

**Fixed:** the fit now measures the whole picture, and the bar is positioned from
the same expression that measures it, so the two cannot drift apart. An audit of
the other ten renderers found this was the only one of its kind — `pattern_strip`
is the only other renderer that both scales and draws numerals, and its numerals
sit inside the chips it already measures.

---

# Part 2 — Review notes

## Severity, as shipped

| # | Finding | Class | Status |
|---|---|---|---|
| 8 | Owl encounter dead-ends permanently | Defect | Fixed |
| 11 | Lesson numerals escape the card | Defect | Fixed |
| — | `_demo_shown_for` leaked across profiles on a shared device | Defect | Fixed |
| — | `math.demo_watch` had lost its Icelandic accents | Defect | Fixed |
| 9 | Camera drifts into the maths board | Feel | Fixed |
| 10 | Answer resolution is slow | Feel | Fixed |
| 5 | Unexplained pips and dots | Clarity | Fixed |
| 7 | Stray ring under the owl | Clarity | Fixed |
| 2 | Tutorial fatigue | Design | Fixed |
| 3 | One question per owl | Design | Fixed (one path left standing, named above) |
| 1 | No calibration for a new player | Design | Fixed |
| 6 | Difficulty does not track the learner | Design | Fixed at the start; lane mix deliberately unchanged |
| 4 | Icelandic quality | Copy | Correctness fixed; register not attempted |

## The one this nearly shipped

The age seed originally raised `highestStep` alongside `currentStep`, on the
reasoning that the two should stay coherent. They should not.
`main_menu.gd` awards the trophy shelf off `highestStep`, gated only on the
child having answered *something* — so a 2. bekkur child seeded to addition step
13 would have collected the top trophy in every domain for their first correct
answer. A reward for a birth year.

Two things were wrong at once: the seed was claiming something it had not
measured, and the comment justifying it said `highestStep` was the ladder's
demotion floor. It is not — demotion floors at 0, and `highestStep` has exactly
one consumer, which is the trophy shelf.

The seed now moves `currentStep` only. A *calibration* move still raises
`highestStep`, because that one is paid for with an answer — the same evidence
the ladder's own stretch-lane fast path accepts. Pinned by
`test_the_seed_does_not_hand_out_trophies`.

## The one a screenshot found

The HUD review (US-9) went looking for what was drawn wrong. It did not think to
ask what was drawn *right* and meant nothing.

The on-screen controls shipped five pads. The fifth was `interact`, drawn as
Hörmann with his beak forward — a good icon, carefully made, with two rejected
earlier attempts documented above it in the source. Nothing in the game has ever
read that action. Owl encounters fire on proximity: `Npc._on_body_entered` calls
`interact()` when the player walks into the zone, and `_process` re-offers on a
cooldown while they stand there. So a child had a 92px target in the thumb
corner, wearing the game's own mascot, that lit up under a finger and led
nowhere. On a phone it sat directly on top of the owl they were walking toward.

Two tests kept it alive. `test_touch_controls` and `test_project_config` both
loop over the action names and assert each one exists in the InputMap — the
wiring is present, and neither ever asked whether anything was on the other end.
An action with no reader is invisible to that shape of test by construction.

Deleted whole: the pad, the `Icon.PECK` geometry, the InputMap entry, both test
expectations, and the `peckBtnSprite` token in all ten theme files, which pointed
at `ui_<theme>_peck` art that was never drawn. Four controls now.

If interaction ever wants a button, the proximity trigger has to come out in the
same change. A control that duplicates what the game already does for you is
this bug again with a working handler.

## What did not ship, and why

**The lesson-copy rewrite (US-4.2).** 47 lessons × 4 bodies × 2 locales. The
right shape is a budget the build can hold: a maximum sentence length and a
maximum word count for anything under `tutorial.*` in
`godot/data/i18n/strings_is.json`, enforced in `tools/validate_i18n.mjs`, then a
writing pass to bring the failures under it. That makes "excellent Icelandic"
measurable instead of a matter of opinion, which is the only way it stays fixed.
Not attempted here because a validator with no writing pass behind it just turns
the build red, and a writing pass done forty-at-a-time by an agent is how a
translation acquires forty new problems.

**The lane weights (US-6).** Reasoned through above. Tier-1, and the repo already
has the instrument that should decide it.

**Removing the silent demo (US-3).** Reasoned through above. Behaviour-changing
removal with an i18n tail; wants its own pass.

## Verification

Ran for this change, all green:

```bash
bash godot/tools/run_tests.sh     # 209 passed, 0 failed
npm run typecheck && npm run validate
bash godot/tools/build_web.sh     # the committed export is what Railway serves
```

Two new suites — `test_math_placement.gd` and `test_math_teaching_budget.gd` —
plus an added assertion in `owl_probe` that a one-question owl draws no chain.

One caution worth recording: `perf_probe` failed once at 29.6 ms/frame against a
12 ms budget while a second Godot process shared the container, then measured
3.2–3.6 ms on three clean runs. Sandbox contention, not a regression — but a
probe that measures wall-clock in a shared container will say that again.

`math_tuning.json` is hashed into `server/src/generated/ladderWeights.ts`, so any
edit to it — including the feedback block — requires
`npx tsx tools/gen_ladder_weights.ts`. Done.

Still requires a human at a controller, because these are the things that have
to be felt rather than asserted:

- the owl transition now reading as a popup rather than a scene change
- whether 700ms is celebration or curtness on a real child's answer
- whether a 2. bekkur seed opens on something a 2. bekkur child finds easy
- the rendered lesson cards, via `bash godot/tools/capture_tutorials.sh`
