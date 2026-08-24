# Development Guide

Status: Current
Authority: Contributor workflow and verification guide.
Last verified against code: 2026-03-31

## Core Loop

Use this as the default change loop:

```powershell
npm.cmd run validate
npx.cmd tsc --noEmit
npm.cmd run dev
```

Add these when needed:

```powershell
npm.cmd run compile
npm.cmd run build
npm.cmd run math:materialize
npm.cmd run math:review
npm.cmd run math:browser-smoke
npm.cmd run themes:screenshots
npm.cmd run i18n:screenshots
npm.cmd run tilesets
```

Both screenshot harnesses need a dev server already running and a browser on
`CHROME_PATH`. `themes:screenshots` is the gate for anything visual: it walks
every level in the registry, captures gameplay and the maths board in each, and
checks the captured pixels against that level's theme token file. It exits
non-zero on an off-palette screen, a console error, or a screen that never
rendered. Output lands in `output/playwright/themes/`, report included.

`npm.cmd run validate` now covers:
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
- edit `public/data/levels/specs/*.spec.json`
- run `npm.cmd run compile`
- do not hand-edit `public/data/levels/compiled/*.json` unless debugging compiler output

Math:
- treat `MathProblemManager`, `ELOManager`, `LearnerStateManager`, `ELOUpdateManager`, and `LearnerSyncService` as one system
- do not change selection rules in one file without checking the companion state and docs
- author offline math growth in `authoring/math/**`, then rerun `npm.cmd run math:materialize`
- do not hand-edit `public/data/math/problems_curriculum.json`; treat it as a materialized output

Persistence:
- profile data, save data, learner snapshot cache, and pending sync queue are separate layers
- clear the smallest relevant localStorage key when debugging

Assets:
- place live assets in `public/assets/**`
- do not use archived copy folders as sources of truth
- treat `ai_assets/` as staging only
- run `npm.cmd run validate:assets` for the asset-only subset when iterating on audio or art

Rendering:
- desktop is currently optimized for integer pixel scaling first
- `1920x1080` is the primary crisp target via a `960x540` base canvas rendered at `2x`
- mobile keeps its fit-first behavior for now and should not be broken by desktop-focused render changes

## Manual Smoke Checklist

Gameplay changes:
- boot to main menu
- load a level
- verify player movement, HUD, pause, and level completion still work

Visual, theme, or art changes:
- run `npm.cmd run themes:screenshots` and look at the PNGs, not just the exit code
- a new asset in the wrong palette fails the conformance check; a new asset that
  is merely ugly does not, so the images still need a human
- brand rules live in `brand/BRAND_SYSTEM.md`; per-world detail in
  `brand/LEVEL_ART_BIBLE.md`; what to generate and where it goes in
  `brand/ASSET_MANIFEST.md`
- after a palette edit, run `python3 brand/tokens/verify_palettes.py`
- tilesets are declared in `public/data/tilesets/tileset_manifest.json` and
  loaded from it, so adding or replacing one needs no code. The five world
  sheets are generated placeholders: `npm.cmd run tilesets` rebuilds them and
  `npm.cmd run tilesets:check` fails if the manifest is stale

Math changes:
- trigger a math challenge
- answer one correct first try
- answer one wrong then corrected retry
- confirm learner summary or save state changes as expected
- if you changed owl flow, selection rails, or MathChallengeScene interaction timing, run `npm.cmd run math:browser-smoke`

Profile or save changes:
- create or log into a profile
- reload the page
- confirm the expected profile, save data, and learner state persist

Admin changes:
- open `admin.html`
- check translation table behavior
- check learner summary rendering
- verify learner API URL save and reload behavior if touched

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
