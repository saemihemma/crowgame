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
4. Answer a small, high-confidence question set.
5. Return to movement with clear feedback and visible progress.

An owl encounter is deliberately short — as shipped, one question. The length is
per-owl in the registry rather than global, so a later gated owl can ask more
without changing the loop for every other one. A fresh profile opens on addition
and counting; other domains join through the normal unlock rules.

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
