# Hörmann

Status: Current
Authority: Repo navigation only. Runtime truth lives in `src/**`, `public/data/**`, `admin.html`, manifests, and live asset references.
Last verified against code: 2026-03-31

Hörmann is a child-first educational platformer for early elementary math practice.

## Runtime: Godot, and only Godot

**Decided 2026-08-24. Hörmann is a Godot game.** The Phaser/TypeScript build in
`src/**` is retired — it is not shipped, not maintained, and not a second
opinion about how anything should work. Where this repo still reads as if there
are two runtimes, that text is stale and should be corrected, not obeyed.

- Runtime truth is `godot/**`.
- Data truth is `godot/data/**`. `public/data/**` was a near-mirror that had
  already drifted; it is being retired with the rest of the web build.
- The gate is `bash godot/tools/run_tests.sh` (61 tests) plus
  `godot/tools/capture` for screenshots.
- Retirement is staged rather than deleted in one commit, so the port can be
  finished against something that still runs. `brand/PRODUCTION_PLAN.md` §2a
  tracks what has moved and what has not.

## What is still to do

See [roadmap.md](./roadmap.md). It lists open work only — finished items are
deleted from it rather than ticked off, and `npm run validate` enforces that.
Finished work is recorded in [progress.md](./progress.md).

## Purpose

What this is:
- the canonical repo entrypoint
- the shortest route to the current docs
- the place to learn which surfaces are live, staged, or historical

What this is not:
- not a substitute for [ONBOARDING_AGENT.md](./ONBOARDING_AGENT.md)
- not the full runtime architecture reference
- not the product-context doc
- not the archive itself

## Start Here

Read in this order:

1. [ONBOARDING_AGENT.md](./ONBOARDING_AGENT.md)
2. [MATH_SYSTEM_ARCHITECTURE.md](./MATH_SYSTEM_ARCHITECTURE.md)
3. [docs/MATH_AUTHORING_PIPELINE.md](./docs/MATH_AUTHORING_PIPELINE.md)
4. [docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md](./docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md)
5. [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) for the canonical verification loop
6. [ASSET_SPECS.md](./ASSET_SPECS.md) and [ai_generation_guide.md](./ai_generation_guide.md) for asset workflows
7. [docs/DOCUMENTATION_HARDENING_2026-03-31.md](./docs/DOCUMENTATION_HARDENING_2026-03-31.md) for the latest documentation review artifact
8. [archived/README.md](./archived/README.md) for historical material only

## Change Routing

If you are changing:
- learner difficulty, review, or unlock logic: read [MATH_SYSTEM_ARCHITECTURE.md](./MATH_SYSTEM_ARCHITECTURE.md) first
- offline math authoring, batch materialization, or review reports: read [docs/MATH_AUTHORING_PIPELINE.md](./docs/MATH_AUTHORING_PIPELINE.md) first
  - what it is not: not empirical child-performance proof, not independent ELO calibration, and not full browser or scene-flow proof by itself
  - blunt boundary: `3000` is total shipped runtime inventory, not `3000` owl-path experiences; the fresh opening owl path currently starts with `addition` plus `counting`, pattern matching joins the broader owl-safe set later, and each encounter serves `2` problems
- profile identity, save data, cache, or hosted sync: read [docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md](./docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md) first
- contributor workflow or verification steps: use [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)
- runtime assets or staging rules: use [ASSET_SPECS.md](./ASSET_SPECS.md)
- broad product intent: use [PROJECT.md](./PROJECT.md) after the current docs, not before

## Canonical Snapshot Rule

Mutable numeric repo counts live in one place only:
- [ONBOARDING_AGENT.md](./ONBOARDING_AGENT.md)

Current architecture docs describe behavior and contracts. They intentionally avoid duplicating scene, level, pool, or manifest counts unless the number itself is part of the runtime rule.

## Doc Taxonomy

| Tier | Meaning | Examples |
| --- | --- | --- |
| Current | live architecture and routing docs | onboarding, math architecture, learner state and sync, development guide |
| Supportive | product or workflow context that still defers to runtime truth | project context, asset specs, AI generation guide |
| Historical | preserved but not current | `archived/**` |
| Staged | working area, not runtime truth | `ai_assets/**` |
| Companion | design artifact paired with runtime docs | `docs/learner_backend_schema.sql` |

## Truth Tiers

Live runtime:
- `godot/**`
- `godot/data/**`
- `godot/assets/**`

Being retired (see the Runtime section above):
- `src/**`, `vite/**`, `index.html` — the Phaser build
- `public/data/**`, `public/assets/**` — its data and assets
- the Playwright harnesses under `tools/` that drove it

Still shared, and staying:
- `admin.html` — translation and learner admin, not part of either game build
- the math authoring pipeline under `tools/` — it feeds the curriculum both
  runtimes read

Render policy:
- the target device is a tablet, held in landscape
- portrait is out of scope; a rotate prompt is in scope
- `960x540` is the design space, and how it fills a landscape device is an open
  design question tracked as Phase 1 of `brand/PRODUCTION_PLAN.md`

Generated:
- `public/data/levels/compiled/*.json`
- `dist/`

Staged:
- `ai_assets/**`

Archived:
- `archived/**`

## Learner Flow At A Glance

Active child lifecycle:
- profile login or resume
- profile save load
- mastery restore
- learner snapshot merge
- local snapshot cache
- optional remote snapshot refresh
- pending queue replay
- challenge completion updates local state first
- optional remote submit

For the full learner identity, save, cache, and hosted-sync lifecycle, use [docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md](./docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md).

## Workflow Docs

- [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md): canonical verification loop and contributor workflow
- [ASSET_SPECS.md](./ASSET_SPECS.md): live asset contract plus companion runtime data
- [ai_generation_guide.md](./ai_generation_guide.md): AI-assisted asset workflow guidance
