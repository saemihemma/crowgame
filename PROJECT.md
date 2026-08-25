# Hörmann Product Context

Status: Supportive
Authority: Product, audience, and design context. Runtime truth lives elsewhere.
Last verified against code: 2026-08-25

## Purpose

This document explains what Hörmann is trying to be.

What this is:
- product framing
- player experience goals
- art and tone direction
- child-first learning intent

What this is not:
- not the canonical runtime reference
- not a scene or file inventory
- not the current learner-save-sync architecture

## Product Summary

Hörmann is a child-first educational platformer designed for young learners practicing early math in short, encouraging sessions.

Core audience:
- children around ages 5-7
- home and family use first
- confidence-sensitive learners who benefit from repetition and strong positive feedback

## Learning Philosophy

Hörmann is built around a few principles:

- success should be common enough to feel motivating
- mistakes should lower difficulty faster than success raises it
- repetition is part of learning, not punishment
- progression should be individualized per child
- parent visibility matters, but the child-facing experience should stay simple

This is why the current learner model favors:
- slow mastery movement
- fast confidence adjustment
- explicit review after misses
- stability-based unlocks rather than lucky streaks

## Player Experience

The intended loop is:

1. choose or resume a child profile
2. move through a readable platforming level
3. meet an owl or enter a math gate
4. answer a small, high-confidence question set
5. return to movement with clear visual feedback and continued progress

Desired feel:
- friendly
- readable on smaller screens
- rewarding without being noisy
- playful rather than school-like

## Current Product Surface

As of 2026-03-22, the shipped surface is a playable prototype with:

- profile-based child login using name plus 4-digit PIN
- a progression loop through multiple levels in the level registry
- owl-driven math interactions
- adaptive learner state per child
- an in-engine parent report showing, per child, curriculum step, first-attempt
  accuracy and review load
- optional cloud save, so a child's progress follows them between devices

## Progression

**Worlds unlock strictly one at a time, in order.** A fresh save offers the
Practice Arena and Emberwood Run; each of the four worlds after that unlocks
when the one before it is completed. `unlockRequirement` in
`godot/data/levels/level_registry.json` is the runtime expression of this, and
`godot/tests/test_registries.gd` fails if the chain breaks.

The reason is the maths, not the platforming. Each world's `mathGating` names
the skills it teaches and the difficulty band it teaches them in, and the bands
step upward: Emberwood is counting and addition at band 1-2, Aurora Spire is
everything together at 2-5. Letting a child pick the fifth world first hands
them subtraction before they have met addition, which is the one thing the
curriculum ladder exists to prevent.

The Practice Arena sits outside the chain deliberately. It is always open, it
holds the whole owl roster at every chain length, and it is where a child goes
to drill rather than to progress.

*Open question for playtesting:* whether a child who stalls on one world should
be offered the next anyway after N attempts. Nothing implements that today.

## Visual And Tone Direction

Hörmann should feel:
- bright
- readable
- stylized for kids
- more modern pixel-art clarity than nostalgic fuzz

The game should avoid:
- muddy silhouettes
- tiny unreadable UI
- scary enemy presentation
- a punitive or test-like tone

## How To Use This Doc

Use this document when you need:
- product intent
- design alignment
- audience reminders
- the reason behind the child-first learner model

If you need implementation truth, start with:
- [README.md](./README.md)
- [ONBOARDING_AGENT.md](./ONBOARDING_AGENT.md)
- [MATH_SYSTEM_ARCHITECTURE.md](./MATH_SYSTEM_ARCHITECTURE.md)
- [docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md](./docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md)
