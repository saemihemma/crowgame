# Hörmann — Product

Status: Current
Authority: Product intent, audience, and design direction. Runtime truth lives in
the code; the system reference is [ARCHITECTURE.md](./ARCHITECTURE.md).
Last verified against code: 2026-08-25

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

The target is roughly **70–85%** first-attempt accuracy: high enough to feel like
winning, low enough that the problems are still doing work.

## The intended loop

1. Choose or resume a child profile.
2. Move through a readable platforming level.
3. Meet an owl.
4. Answer a small, high-confidence question set.
5. Return to movement with clear feedback and visible progress.

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

**Difficulty drops faster than it climbs, and demotions are silent.** A step-up
is celebrated; a step-down is never signalled. The child should never be told
they got worse.

**Nothing is tied to time or streaks.** Golden problems are a seeded coin flip on
the save state, not a pressure mechanic. There is nothing a child can feel
anxious about protecting.

**The 4-digit PIN is a "which kid am I" selector, not security.** It is never
sent anywhere. See [PRIVACY.md](./PRIVACY.md).

**The only PII collected is a parent's email address.** Children carry a display
name and nothing else. A delete path exists from the first release that stores
anything.

## Progression

**Worlds unlock strictly one at a time, in order.** A fresh save offers the
Practice Arena and Emberwood Run; each of the four worlds after that unlocks when
the one before it is completed. `unlockRequirement` in
`godot/data/levels/level_registry.json` is the runtime expression of this, and
`godot/tests/test_registries.gd` fails if the chain breaks.

The reason is the maths, not the platforming. Each world's `mathGating` names the
skills it teaches and the band it teaches them in, and the bands step upward:
Emberwood is counting and addition at band 1–2, Aurora Spire is everything
together at 2–5. Letting a child pick the fifth world first hands them
subtraction before they have met addition — the one thing the curriculum ladder
exists to prevent.

The Practice Arena sits outside the chain deliberately. It is always open, holds
the whole owl roster at every chain length, and is where a child goes to drill
rather than to progress.

## Current surface

A playable prototype with profile-based child login, a progression chain through
the level registry, owl-driven maths interactions, adaptive learner state per
child, an in-engine parent report (per-child curriculum step, first-attempt
accuracy, review load), and optional cloud save so progress follows a child
between devices.

## Open product questions

These are genuinely undecided, and nothing implements them:

- Whether a child who stalls on one world should be offered the next anyway after
  N attempts.
- Whether multiplication and division belong in the owl path at all at this age —
  see `roadmap.md`.
- Whether response time should become a learning signal. It is recorded and
  unused.

Open engineering work lives in [roadmap.md](./roadmap.md), not here.
