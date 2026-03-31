# ELO-Based Math Progression System - Historical Summary

Status: Historical
Authority: Archived planning document only. Do not treat this file as current runtime truth.
Last verified against code: 2026-03-22
Original plan date: 2026-02-13

## Why This File Exists

This is a readable archival summary of an earlier math-progression direction. It is preserved for provenance, not for implementation guidance.

Use current docs instead:
- [../../MATH_SYSTEM_ARCHITECTURE.md](../../MATH_SYSTEM_ARCHITECTURE.md)
- [../../docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md](../../docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md)

## Historical Intent

The earlier plan aimed to replace static math difficulty with:
- an ELO-style learner rating
- milestone-based unlocking
- child-friendly visible "math levels"
- broader economy ties such as coins, cosmetics, and lives

The old target band was roughly:
- `80-90%` success

## Historical Assumptions That Are No Longer Current

The superseded plan assumed:
- a much higher starting ELO and wider numeric rating range
- a `60 / 30 / 10` comfort / at-level / stretch split
- milestone-based domain unlocking
- visible "math level" progression for the player
- a larger reward layer tied directly to cosmetics, lives, and milestone celebrations

Those assumptions no longer describe the live system.

## What Replaced It

The current runtime moved toward a more child-first model with:
- lower starting mastery
- mastery plus confidence plus review instead of a single visible ladder
- explicit same-session and spaced review after misses
- stability-based domain unlocking
- optional hosted sync and parent-facing learner visibility

## Historical Value

This file is still useful if you want to understand:
- why the repo has older ELO terminology in places
- why some progression ideas reference milestones or visible levels
- what design questions were being explored before the current learner model settled

## Archive Rule

Do not update this file to match current behavior.

If the live system changes, update the current docs instead and leave this file as a historical artifact.
