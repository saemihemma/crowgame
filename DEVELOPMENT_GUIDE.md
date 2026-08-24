# Development Guide

Status: Current
Authority: Contributor workflow and verification guide.
Last verified against code: 2026-03-31

## Core Loop

Use this as the default change loop:

```powershell
npm run validate
npx tsc --noEmit
godot --path godot   # play it
```

Add these when needed:

```powershell
npm run compile
bash godot/tools/build_web.sh
npm run math:materialize
npm run math:review
node godot/tools/web_boot_smoke.mjs
```

`npm run validate` now covers:
- content validation
- doc metadata presence checks
- canonical onboarding snapshot checks
- duplicate mutable-count checks in the current doc set
- selected architecture-contract checks for learner, math, and UI docs
- source-derived live asset presence checks and suspicious live-asset leftovers

## Before You Edit

- confirm the doc you are using is Current, not Historical
- confirm the file you are about to touch is live, not archived
- if touching levels, edit specs first
- if touching learner behavior, read both current architecture docs first
- if touching assets, confirm runtime references in BootScene, registries, or manifests

## Content Rules

Levels:
- edit `godot/data/levels/specs/*.spec.json`
- run `npm run compile`
- do not hand-edit `godot/data/levels/compiled/*.json` unless debugging compiler output

Math:
- treat `MathProblemManager`, `ELOManager`, `LearnerStateManager`, `ELOUpdateManager`, and `LearnerSyncService` as one system
- do not change selection rules in one file without checking the companion state and docs
- author offline math growth in `authoring/math/**`, then rerun `npm run math:materialize`
- do not hand-edit `godot/data/math/problems_curriculum.json`; treat it as a materialized output

Persistence:
- profile data, save data, learner snapshot cache, and pending sync queue are separate layers
- clear the smallest relevant localStorage key when debugging

Assets:
- place live assets in `godot/assets/**`
- do not use archived copy folders as sources of truth
- treat `ai_assets/` as staging only
- run `npm run validate:assets` for the asset-only subset when iterating on audio or art

Rendering:
- desktop is currently optimized for integer pixel scaling first
- `1920x1080` is the primary crisp target via a `960x540` base canvas rendered at `2x`
- mobile keeps its fit-first behavior for now and should not be broken by desktop-focused render changes

## Manual Smoke Checklist

Gameplay changes:
- boot to main menu
- load a level
- verify player movement, HUD, pause, and level completion still work

Math changes:
- trigger a math challenge
- answer one correct first try
- answer one wrong then corrected retry
- confirm learner summary or save state changes as expected
- if you changed owl flow or selection rails, rebuild and run `node godot/tools/web_boot_smoke.mjs`

Profile or save changes:
- create or log into a profile
- reload the page
- confirm the expected profile, save data, and learner state persist

Grown-up surface changes (parent report, cloud panel):
- open them from the main menu with at least one child profile present
- check the report renders per-domain lines rather than raw identifiers
- switch locale and confirm no key leaks through untranslated
- for cloud save, exercise the real flow: request a link, enroll, play, then load
  on a second device and confirm the progress arrives

Cloud sync changes:
- confirm the local save still works with the API unreachable — local-only is the
  intended degraded state, not an error
- confirm a stale device's save is rejected and it adopts the authoritative one
- confirm its attempts still landed anyway

## Documentation Update Rule

Update docs in the same pass when you change:
- runtime architecture
- current commands
- localStorage keys
- scene flow
- learner state contracts
- archive policy

Current docs:
- [README.md](./README.md)
- [ONBOARDING_AGENT.md](./ONBOARDING_AGENT.md)
- [MATH_SYSTEM_ARCHITECTURE.md](./MATH_SYSTEM_ARCHITECTURE.md)
- [docs/MATH_AUTHORING_PIPELINE.md](./docs/MATH_AUTHORING_PIPELINE.md)
- [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)
- [docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md](./docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md)

## Restore Rule

Do not pull material out of `archived/**` casually.

If an archived file is needed again:
- verify why it was archived
- restore it deliberately
- wire it back into runtime
- update current docs so it is no longer treated as historical
