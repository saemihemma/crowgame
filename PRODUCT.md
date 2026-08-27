# Hörmann — Product

Status: Current
Authority: Product intent, audience, and design direction. Runtime truth lives in
the code; the system reference is [ARCHITECTURE.md](./ARCHITECTURE.md).

## What this is

Hörmann is a child-first educational platformer for early-elementary maths
practice, designed for short, encouraging sessions. It was built for one
seven-year-old first, and now for other people's children too.

That origin is the most useful thing to know about it. It is not a product
looking for a market; it is a game a parent needed, generalized carefully.

Core audience:
- children around ages 5–7
- home and family use first
- confidence-sensitive learners who benefit from repetition and strong positive
  feedback

## Learning philosophy

- Success should be common enough to feel motivating.
- Mistakes should lower difficulty faster than success raises it.
- Repetition is part of learning, not punishment.
- Progression should be individualized per child.
- Parent visibility matters, but the child-facing experience stays simple.

This is why the learner model favours slow mastery movement, fast confidence
adjustment, explicit review after misses, and stability-based unlocks rather than
lucky streaks. The mechanics that implement it are in
[ARCHITECTURE.md](./ARCHITECTURE.md#the-math-system).

The band we are aiming at is "mostly winning, but still working" — high enough
that a child feels successful, low enough that the questions are not free. The
number that expresses it is a tuning target, not a product promise, and it lives
with the tuning work in `roadmap.md`.

## The intended loop

1. Choose or resume a child profile.
2. Move through a readable platforming level.
3. Meet an owl.
4. Answer one question.
5. Return to movement with clear feedback and visible progress.

**One owl, one question — every owl, with no exception available.** The length
used to be per-owl in the registry, so that a later gated owl could ask more
without changing the loop for everything else. Played, that was not a dial, it
was a stall: every level carried a three-question owl and one carried three of
them, so a child running a platformer was stopped for three questions in a row,
repeatedly. The roster still has range, and the range is difficulty — an easier
owl, a harder one — which is the dial that was actually wanted.
`godot/tests/test_owl_chains.gd` fails the build on any owl that asks for more.

A fresh profile opens on addition and counting; other domains join through the
normal unlock rules.

## What finishing means

Three things a child can point at, per level: the level is cleared, its three big
coins are found, its owls are free. The completion percentage is the mean of the
levels, so every level weighs the same -- a global ratio would make the practice
arena, which holds far more owls than any level, worth more than the game.

Big coins are the unit of progress rather than ordinary coins on purpose. A coin
drops into a lifetime purse that only rises, so "412 of 530" tells a six-year-old
nothing and barely moves; three per level is countable on one hand. One you have
already found comes back as a hollow ghost you walk through, which is what makes
a second visit worth making.

A run only counts if it reaches the door. Records are best-of, so replaying a
level and doing worse takes nothing away.

Each level also ends with one owl the crow cannot reach yet, guarded and up a
climb whose last hop is beyond the current jump. It counts toward the
percentage, and the door never waits for it -- so 100% is deliberately out of
reach until the crow can do more than it can today.

Desired feel: friendly, readable on small screens, rewarding without being noisy,
playful rather than school-like.

Avoid: muddy silhouettes, tiny unreadable UI, scary enemy presentation, a
punitive or test-like tone.

Visually it should read as bright, stylized, modern pixel-art clarity — not
nostalgic fuzz.

## Design commitments

These are product decisions, not implementation details, and they are the ones
most likely to be argued with later.

**A missed question is a setup, not a punishment.** A failed challenge ends in
teaching — the answer is revealed with its explanation. A later correct answer on
that same item is celebrated harder than an ordinary win. The worst moment
available is deliberately converted into the best one.

**First contact with new maths cannot hurt.** When a level introduces a domain a
child has never attempted, the owl opens with a worked example, then a freebie: a
win records, a miss records nothing at all.

**A lesson answers something the child just did; it is never a toll on something
they are about to do.** Teaching used to fire in front of any question whose idea
the child had not met. Each of those lessons was justified on its own, and
together they were an ambush — a board of cards between a child and the owl they
walked up to, on an idea they had not asked about. So there is **one lesson per
maths category**: the one for the rung they are standing on, delivered after an
answer, and never more than one at a single owl. Levelling up in a category is
what moves a child onto a rung they have not been taught, which is why it reads
as "when I level up, I get taught".

**Asking for the lesson again is always allowed.** Every question carries a "?"
that re-opens the lesson for that category, however many times a child wants it.
It records nothing — looking something up is not being tested — and it is what
makes the automatic teaching safe to keep rare.

**Difficulty drops faster than it climbs, and demotions are silent.** A step-up
is celebrated; a step-down is never signalled. The child should never be told
they got worse.

**No pressure mechanics.** No timer, no daily streak, no decay, nothing that
expires while the game is closed. There is an in-level streak, and the rule that
makes it safe is that **a wrong answer pauses it and never resets it** — the one
thing a child might want to protect is the one thing a wrong answer cannot take
away. Whether it should exist at all is open; see `roadmap.md`.

**The 4-digit PIN is a "which kid am I" selector, not security.** It is never
sent anywhere. See [PRIVACY.md](./PRIVACY.md).

**The only PII collected is a parent's email address.** Children carry a display
name and nothing else. A delete path exists from the first release that stores
anything.

## Progression

**Worlds unlock one at a time, in order.** `unlockRequirement` in
`godot/data/levels/level_registry.json` is the runtime expression of it, and
`godot/tests/test_registries.gd` fails if the chain breaks.

**The reason is the maths, not the platforming.** Each world's `mathGating` names
the skills it teaches and the band it teaches them in, and the bands step upward.
Letting a child pick a late world first would hand them subtraction before they
had met addition — the one thing the curriculum ladder exists to prevent. That is
why the order is not a player choice.

**The practice arena sits outside the chain deliberately.** It is always open and
holds the whole owl roster, and it is where a child goes to drill rather than to
progress.

## Open product questions

These are genuinely undecided, and nothing implements them:

- Whether a child who stalls on one world should be offered the next anyway after
  N attempts.
- Whether multiplication and division belong in the owl path at all at this age —
  see `roadmap.md`.
- Whether response time should become a learning signal. It is recorded and
  unused.

Open engineering work lives in [roadmap.md](./roadmap.md), not here.
