# Hörmann Agent Context

Status: Supportive
Authority: Practical contributor notes. Code and data outrank this file.
Last verified against code: 2026-03-22

## Read This After Onboarding

This file is for practical working notes once you already know where the current truth lives.

Use it for:
- common hotspots
- debugging heuristics
- workflow reminders
- repo-specific footguns

Do not use it as the final source of truth when it conflicts with runtime code or current architecture docs.

## Open Work Lives in roadmap.md

`roadmap.md` is the single list of what is still to do. It carries hard rules at
the top: **finished items are deleted from it, never ticked off or annotated**,
and what you actually did goes in `progress.md`. `npm run validate` fails the
build if the roadmap picks up checkboxes, strikethrough, "(done)" notes or a
completed-work heading, or if the rules block is removed.

Before starting work, read it. After finishing work, the roadmap should be
shorter.

## Quick Working Model

- `BootScene` is the system wiring hub.
- `GameScene` is still the largest gameplay hotspot.
- math progression spans `MathProblemManager`, `ELOManager`, `LearnerStateManager`, `ELOUpdateManager`, and `LearnerSyncService`.
- save behavior is profile-scoped, not global-only.
- `admin.html` is now translation plus learner admin.

## Hotspots By Area

Gameplay:
- `src/scenes/GameScene.ts`
- `src/entities/Player.ts`
- `public/data/tuning/*.json`

Math:
- `src/math/**`
- `src/systems/ELOUpdateManager.ts`
- `src/systems/LearnerStateManager.ts`
- `public/data/math/*.json`

Profile and persistence:
- `src/systems/ProfileManager.ts`
- `src/systems/SaveManager.ts`
- `src/systems/LearnerSyncService.ts`

Content:
- `public/data/levels/specs/*.spec.json`
- `public/data/levels/level_registry.json`
- `tools/compile-levels.ts`

## Common Footguns

- localStorage can make bugs look nondeterministic across reloads
- changing Boot initialization order can break multiple subsystems at once
- level specs are the authored source; compiled level JSON is generated output
- not every file under `public/assets/**` is live
- `archived/**` is intentionally non-runtime

## Recommended Debug Order

1. confirm the active profile
2. inspect the relevant localStorage keys
3. trace Boot initialization if behavior differs after reload
4. check registries and manifests before assuming an asset or content file is live
5. only then change runtime code

## Verification Defaults

Start with:

```powershell
npm.cmd run validate
npx.cmd tsc --noEmit
```

Add these when relevant:

```powershell
npm.cmd run compile
npm.cmd run build
```

Manual smoke is still required for:
- scene transitions
- learner state behavior
- admin surface changes
- asset wiring

## Doc Hygiene Rule

If a change affects:
- scene count
- level count
- problem pool count
- answer modes
- learner storage keys
- current docs vs historical docs

then update the relevant current doc in the same pass.
