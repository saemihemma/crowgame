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
```

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

## Adding a Locale

The engine is generic — EN and IS are not special-cased — but a third language is
a real job, not an afternoon. This is here rather than in `roadmap.md` because it
is a cost estimate, not open work: nothing is blocked on it and no third language
is planned.

What it takes:

1. A bundle in all four locations (`public/data/i18n/` and `godot/data/i18n/`,
   `strings_<code>.json` each). **264 keys**, of which 175 are math phrasing
   templates — short and formulaic, but a genuine translation job.
2. `LOCALES` in `src/systems/TextManager.ts`; `LOCALE_FILES` and
   `LOCALE_ENDONYMS` in `godot/scripts/autoload/text_manager.gd`.
3. An endonym — the language's name in its own language, never translated.
4. **A drawn flag in both ports.** `FlagIcon` has a case per locale and falls
   back to the US flag for anything unknown, so a new language would silently
   show the wrong flag. They are vector geometry, not emoji, for reasons the
   files themselves explain.
5. **A plural rule** in `PLURAL_RULES` (`tools/math_phrasing_catalog.mjs`) and in
   both runtimes' `pluralKey`/`_plural_key`. English inflects at 1; Icelandic at
   1, 21, 31 and so on. Six keys carry a `.one` sibling that the new locale needs
   too.
6. A pass of the fit budget in `tools/validate_i18n.mjs`.

**The selector is the hard part.** It is a segmented control sized for exactly
two pills, and the width is already measured against the tightest heading on each
port (x 636 on the web main menu, x 620 on the Godot login). A third pill does
not fit that row, and the fit budget will not catch it — the endonyms are
measured at runtime by the component itself. Three or more languages needs a
different pattern, not a wider row.

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
