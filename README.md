# Hörmann

Status: Current
Authority: Repo navigation only. Runtime truth lives in `src/**`, `public/data/**`, `admin.html`, manifests, and live asset references.
Last verified against code: 2026-03-31

Hörmann is a child-first educational platformer for early elementary math practice.

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
  - blunt boundary: `3150` is total shipped runtime inventory, not `3150` owl-path experiences; the fresh opening owl path currently starts with `addition` plus `counting`, pattern matching joins the broader owl-safe set later, and each encounter serves `1` problem
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
- `src/**`
- `public/data/**`
- `admin.html`
- referenced files in `public/assets/**`

Desktop render policy:
- desktop is optimized for integer pixel scaling first
- `1920x1080` is the primary crisp target via `960x540` rendered at `2x`
- mobile remains on a separate fit-first scaling path for now

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

## Presentation Docs

- [docs/BRAND_GUIDELINE.md](./docs/BRAND_GUIDELINE.md): palette, type, motion and voice rules, derived from the shipped art and theme JSON
- [docs/pitch/README.md](./docs/pitch/README.md): the investor deck and how to export it

## Workflow Docs

- [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md): canonical verification loop and contributor workflow
- [ASSET_SPECS.md](./ASSET_SPECS.md): live asset contract plus companion runtime data
- [ai_generation_guide.md](./ai_generation_guide.md): AI-assisted asset workflow guidance
