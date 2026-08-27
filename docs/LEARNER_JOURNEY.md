# The Learner Journey

Status: Current
Authority: Runtime code, specifically `godot/scripts/systems/learner_state_manager.gd`, `godot/scripts/math/owl_selection.gd`, `godot/scripts/entities/npc/math_challenge_component.gd` and their `math-kernel/` parity twins. `tools/sim_learner_journey.ts` is the enforcing authority: it plays the journey described here and fails the build when the story stops being true.
Last verified against code: 2026-08-26

## Purpose

Everything else in the maths system is written from the machine's side: which
rung a problem lands on, which lesson opens a concept, which guard refuses which
mistake. This document is written from the child's side. It is the story of one
learner from their first problem to their last, and every claim in it is a number
the simulator measures rather than a promise.

It exists because a system can pass every guard and still fail the only thing
that matters. Before this pass, the content was correct, the lessons were
verified, the caps were never breached — and a thriving child saw **335 of 4039
problems**, never once received division after earning it, and spent 62% of a
1200-problem journey on addition. Nothing was broken. Nothing was reaching the
child either.

## The story

> **As a six-year-old**, I answer a question an owl asks me. When I get things
> right, the owl asks harder ones. When I keep getting a whole subject right, it
> starts asking me about something new — and it asks me about the new thing
> straight away, not eventually. When I meet something I have never been taught,
> I get a short lesson first. Over months, I meet everything the game has for me.

Four promises, in order. Each maps to one mechanism, and each is measured.

### 1. "When I get things right, the owl asks harder ones"

ELO per domain, plus a curriculum step per domain. Three wins at the current step
with at least 80% accuracy over the last ten attempts promotes the child one
rung; two misses in five demotes them. Promotion skips rungs with no content, so
a child never parks on an empty step.

**Measured.** A thriving child (95% correct) climbs addition to step 11 by
attempt 200 and to its ceiling by attempt 600, then oscillates between 19 and 21
for the rest of the journey. That wobble is the system working: the child sits at
the edge of what they can do, slips, and re-climbs. It is what the 70–85%
sweet spot looks like from inside.

### 2. "When I keep getting a whole subject right, it starts asking me about something new"

`DOMAIN_PREREQUISITES` gates each domain behind twenty attempts of its
prerequisite at 90% first-try accuracy with a non-growing review backlog.
Addition and counting are open from the first problem; subtraction, comparison,
number sequences and multiplication open behind addition; pattern matching behind
counting; division behind multiplication.

**This promise used to be impossible to keep for half the domains.** The twenty
attempts were counted inside a single 40-deep window shared by every domain, so a
subject had to occupy *half of all recent play* before anything downstream of it
could open. Only the dominant domain ever does. `pattern_matching` and `division`
were therefore unreachable — not rare, not slow: unreachable, at every accuracy,
in every journey. Each domain now keeps its own twenty-attempt history
(`LearnerDomainHistory.attemptHistory`), so the question "did this child do well
at counting?" is answered by how they did at counting.

**Measured.** A thriving child now unlocks pattern matching at attempt 39 and
division at 179.

### 3. "It asks me about the new thing straight away"

The owl picks the subject a child has practised least recently, weighted by
`domainWeights` in `math_tuning.json`. A domain never served is maximally stale,
so a newly unlocked subject is offered on the next question.

**This is the promise that was most broken.** The owl used to prefer
`allowedDomains[0]` — the first entry of its `problemTypes` list, which is
addition for every owl and every child — and the attempt order puts the preferred
domain first 70% of the time. So addition took roughly seven of every ten
problems forever, and a subject a child had *earned* could go unserved
indefinitely. Comparison waited 72 attempts after unlocking. Division waited for
ever.

`domainWeights` is where "how much addition should a child meet" now lives: a
designer's dial, rather than an accident of the order a JSON list happens to be
written in.

**Measured.** Every gap between unlocking a domain and being served it is now
between 0 and 4 attempts, across all three profiles. Addition fell from 62% of a
journey to 21%.

### 4. "I get a short lesson first, and over months I meet everything"

Each concept opens with a four-card lesson the first time a child reaches it.
Coverage is the honest test of the whole chain: a problem no journey reaches is a
problem sitting in git.

**Measured.** A thriving child's 1200-attempt journey went from 335 distinct
problems and 22 lessons to 540 distinct problems and 39 lessons.

## What the numbers look like now

A thriving child (95% correct), 1200 attempts, from `npm run math:journey`:

| Domain | Unlocked | First served | Gap | Served | Top step |
| --- | --- | --- | --- | --- | --- |
| `addition` | 1 | 1 | 0 | 254 | 19 |
| `counting` | 1 | 2 | 1 | 185 | 6 |
| `pattern_matching` | 39 | 39 | 0 | 95 | 7 |
| `subtraction` | 44 | 44 | 0 | 209 | 16 |
| `comparison` | 44 | 45 | 1 | 101 | 6 |
| `number_sequence` | 44 | 46 | 2 | 95 | 6 |
| `multiplication` | 44 | 48 | 4 | 145 | 8 |
| `division` | 179 | 179 | 0 | 116 | 9 |

Addition, counting, pattern matching and subtraction are climbed to the **ceiling
the age band allows** — there is no further rung under an operand cap of 20.
Multiplication and division reach steps 8 and 9 of 14 and 15. That is slow rather
than stuck: their ELO grows only from their own attempts, and they open late. If
it should be faster, `domainWeights` is the dial and
`/api/v1/admin/ladder-tuning` is the instrument that says so from real play.

## What is still out of reach, and why

Eight concepts hold lessons no journey opens.

- `addition.tens_and_ones`, `addition.carrying`, `subtraction.tens_and_ones`,
  `subtraction.borrowing` — every problem in them has an operand above 20.
  Declared in `knownUnreachable`; the operand cap is the age band, not an
  oversight.
- `multiplication.two_digit`, `division.two_digit` — the same cap, one domain
  over. A child reaches the rung below and stops.
- `comparison.compare_larger`, `number_sequence.big_skips` — reachable in
  principle: both sit three rungs above where a thriving child plateaus, and a
  4000-attempt journey still does not arrive. These two are the honest tail.

## Keeping the story true

`tools/sim_learner_journey.ts` runs in `npm run validate` and fails the build on
three properties, each one a defect it was written to catch:

1. **No domain may unlock and go unserved** for more than 25 attempts. Reverting
   the staleness rotation reproduces gaps of 57, 63, 71 and 534 attempts, and the
   guard names every one.
2. **A thriving child must reach division.** It could not, for as long as
   unlocking read a shared window.
3. **Distinct-problem coverage must not collapse** below 450 for a thriving
   child.

`npm run math:journey` prints the table above plus a step trace, which is the
fastest way to tell a stall from slow going.

Two things this does not do. It plays the selector rails rather than the literal
`MathChallengeScene` input and retry flow, so it is progression evidence and not
a UI test. And its success rates are stipulated: a "95% child" is an assumption
about children, not a measurement of one. Only real play settles that, which is
what the ladder-tuning surface exists for.
