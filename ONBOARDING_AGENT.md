# Crow Agent Onboarding

Status: Current
Authority: Operational guide. Runtime truth still lives in `src/**`, `public/data/**`, manifests, and referenced assets.
Last verified against code: 2026-03-31

## Purpose

Audience: agents starting their first Crow task or returning after a gap.

Outcome: after reading this document, you should know where to start, which docs are current, which files are authoritative, which verification loop to run, and which generated or archived areas not to edit.

What this is:
- a first-stop routing and execution guide
- a map to current architecture docs
- a guardrail document for live vs generated vs archived material

What this is not:
- not the full architecture reference
- not the product or art-direction bible
- not historical planning
- not the ultimate source of truth when code and docs disagree
- not the external skills catalog

## Doc Map

Current:
- [README.md](./README.md): canonical entrypoint
- [MATH_SYSTEM_ARCHITECTURE.md](./MATH_SYSTEM_ARCHITECTURE.md): current math progression and problem selection behavior
- [docs/MATH_AUTHORING_PIPELINE.md](./docs/MATH_AUTHORING_PIPELINE.md): offline math authoring, materialization, and review workflow
- [docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md](./docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md): profile, save, learner state, offline queue, and hosted sync contracts
- [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md): contributor checklist and verification loop

Supportive:
- [PROJECT.md](./PROJECT.md): product goals, player experience, and design context
- [AGENT_CONTEXT.md](./AGENT_CONTEXT.md): practical notes and hotspots for contributors
- [ASSET_SPECS.md](./ASSET_SPECS.md): live asset contract and staging guidance
- [ai_generation_guide.md](./ai_generation_guide.md): workflow guidance for AI-assisted asset creation
- [LICENSE_ATTRIBUTIONS.md](./LICENSE_ATTRIBUTIONS.md): asset provenance and attribution obligations

Historical:
- [archived/README.md](./archived/README.md): archive index
- [archived/docs/elo-math-system-plan.md](./archived/docs/elo-math-system-plan.md): superseded planning document, not current runtime truth

## Source Of Truth Map

When docs disagree, trust these in order:

1. Runtime code in `src/**`
2. Runtime data in `public/data/**`
3. Asset references from BootScene, registries, and manifests
4. Current docs
5. Supportive docs
6. Archived docs

Most important anchors:
- [src/main.ts](./src/main.ts): scene registration
- [src/scenes/BootScene.ts](./src/scenes/BootScene.ts): boot-time initialization, asset loading, startup routing
- [admin.html](./admin.html): translation and learner admin surface

## First 5 Minutes

Use these exact commands in this Windows PowerShell environment:

```powershell
npm.cmd run validate
npx.cmd tsc --noEmit
npm.cmd run dev
```

If level specs changed:

```powershell
npm.cmd run compile
```

If math authoring sources changed:

```powershell
npm.cmd run math:materialize
npm.cmd run math:review
npm.cmd run math:browser-smoke
npm.cmd run validate
```

Optional broader pre-handoff check:

```powershell
npm.cmd run build
```

Notes:
- Dev server runs on port `8080` via [vite/config.dev.mjs](./vite/config.dev.mjs).
- There is no dedicated lint or automated test script in [package.json](./package.json).
- Desktop render policy now targets crisp integer pixel scaling first via a `960x540` base canvas.
- `npm.cmd run validate` now checks content integrity, doc metadata, the onboarding snapshot block, selected architecture-contract drift rules, math-authoring drift, and source-derived asset presence plus suspicious live-asset leftovers.
- The canonical verification loop lives in [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md).

## Dated Repo Snapshot

Snapshot as of 2026-03-24:

- Crow is a Vite + TypeScript + Phaser game with a separate translation and learner admin surface in [admin.html](./admin.html).
- [godot/data/registries/scenes.json](./godot/data/registries/scenes.json) registers 5 scenes:
  - `BootScene`
  - `LoginScene`
  - `MainMenuScene`
  - `LevelSelectScene`
  - `GameScene`
  - `HUDScene`
  - `MathChallengeScene`
  - `PauseScene`
- [src/scenes/BootScene.ts](./src/scenes/BootScene.ts) loads 4 math pools totaling 3000 problems:
  - `easy`: 15
  - `dataset`: 40
  - `gaps`: 60
  - `curriculum`: 2885
- [public/data/levels/level_registry.json](./public/data/levels/level_registry.json) contains 6 levels, including `level_99`.
- [public/data/npcs/npc_registry.json](./public/data/npcs/npc_registry.json) contains 1 NPC entry.
- [public/data/enemies/enemy_registry.json](./public/data/enemies/enemy_registry.json) contains 1 enemy type.
- [godot/data/audio/audio_manifest.json](./godot/data/audio/audio_manifest.json) currently exposes 5 music tracks and 15 live SFX entries.
- Math UI is currently MCQ-only in [src/ui/components/MathBoard.ts](./src/ui/components/MathBoard.ts).
- The shipped owl path is a smaller local-safe subset of that inventory, not the whole `3000`; use `reports/math-batches/owl-surface-summary.json` for the owl-safe inventory and fresh-profile subset, not just the full runtime headline.

This is the only canonical numeric snapshot block in the current docs. Refresh it whenever scene count, level count, pool count, or live manifest counts change.

## Actual Runtime Flow

1. [src/main.ts](./src/main.ts) registers the scene stack.
2. [src/scenes/BootScene.ts](./src/scenes/BootScene.ts) preloads assets and data, then initializes:
   - `TextManager`
   - `ProfileManager`
   - `LevelManager`
   - `NPCFactory`
   - `MathProblemManager`
   - `SaveManager`
   - `ELOManager`
   - `LearnerStateManager`
   - `LearnerSyncService`
   - `ELOUpdateManager`
   - `LevelingManager`
   - `AudioManager`
3. Local math selection is now curriculum-step capped:
   - `LearnerStateManager` owns per-domain `currentStep` and `winsAtCurrentStep`
   - `ELOAwareStrategy` only serves easier, review, or current-step problems for the owl path
   - the local owl path currently caps `maxOperand` at `20`
   - opening unlocked domains currently `addition` plus `counting`; the fresh opening owl path is addition-first, and `pattern_matching` is owl-safe overall but unlocks later via the normal domain-stability rules
   - the shipped owl path serves `2` problems per encounter
4. Boot routes to:
   - `LoginScene` if there is no active profile
   - `MainMenuScene` if there is an active profile
5. Main progression is:
   - `LoginScene -> MainMenuScene -> LevelSelectScene -> GameScene`
6. Overlay and support scenes:
   - `HUDScene`
   - `MathChallengeScene`
   - `PauseScene`

Important:
- localStorage materially affects startup, learner state, translations, and sync behavior
- profile switching rehydrates save data, learner snapshot state, and recent-problem memory
- desktop rendering is intentionally optimized for `1080p` integer scaling; mobile remains a separate fit-first track

## Task Routing

| Task | Start Here In Crow | Deep Doc If Needed | Verify | Optional External Skill |
| --- | --- | --- | --- | --- |
| Level or layout changes | `public/data/levels/specs/*.spec.json`, `public/data/levels/level_registry.json`, `tools/compile-levels.ts` | [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) | `npm.cmd run compile`, `npm.cmd run validate`, manual smoke | `agent-skills` routing if useful |
| Combat or player feel | `src/entities/Player.ts`, `public/data/tuning/player_base.json`, `public/data/tuning/combat_tuning.json`, `public/data/tuning/camera_tuning.json` | [AGENT_CONTEXT.md](./AGENT_CONTEXT.md) | `npx.cmd tsc --noEmit`, manual smoke | `agent-skills` routing if useful |
| Math selection or learner behavior | `src/math/**`, `src/systems/ELOUpdateManager.ts`, `src/systems/LearnerStateManager.ts`, `src/systems/LearnerSyncService.ts` | [MATH_SYSTEM_ARCHITECTURE.md](./MATH_SYSTEM_ARCHITECTURE.md), [docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md](./docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md) | `npm.cmd run validate`, `npx.cmd tsc --noEmit`, manual smoke | `agent-skills` routing if useful |
| Math authoring or replay-density work | `authoring/math/**`, `tools/math_authoring.ts`, `tools/materialize_math_batches.ts`, `reports/math-batches/**` | [docs/MATH_AUTHORING_PIPELINE.md](./docs/MATH_AUTHORING_PIPELINE.md) | `npm.cmd run math:materialize`, `npm.cmd run math:review`, `npm.cmd run validate` | `agent-skills` routing if useful |
| Profile or save bugs | `src/systems/ProfileManager.ts`, `src/systems/SaveManager.ts`, `src/systems/LearnerSyncService.ts` | [docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md](./docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md) | profile/login/save smoke | `agent-skills` routing if useful |
| Translation or admin changes | [admin.html](./admin.html), `src/systems/TextManager.ts`, `public/data/i18n/strings_en.json` | [AGENT_CONTEXT.md](./AGENT_CONTEXT.md) | admin smoke plus in-game string smoke | `agent-skills` routing if useful |
| Asset or audio wiring | [src/scenes/BootScene.ts](./src/scenes/BootScene.ts), `public/assets/**`, `public/data/audio/audio_manifest.json` | [ASSET_SPECS.md](./ASSET_SPECS.md) | manual smoke | `agent-skills` routing if useful |

Math authoring report boundaries:
- It is a deterministic offline authoring and verification pipeline for the shipped concrete pools.
- It is not empirical proof that the frozen ELO bands are perfect for every child.
- Use `reports/math-batches/runtime-selector-smoke.json` for the current runtime-aligned owl selector smoke, not just the batch proxy reviews.
- Use `reports/math-batches/runtime-browser-smoke.json` for the literal browser-backed owl/math scene smoke.
- Use `reports/math-batches/owl-surface-summary.json` when you need the current owl-safe subset, not the full-repo `3000` inventory count.
- `openingUnlockedInventory*` means unlocked-domain inventory before current-step clamping.
- `freshReachable*` means the real fresh-profile day-one reachable subset after current-step clamping.
- Current shipped owl interaction length is `2` problems per owl encounter, and the follow-up problem now prefers an alternate unlocked domain before falling back to the full owl-safe set.
- That selector smoke is selection-layer evidence built from the shared owl helper plus live learner-state and NPC config; it is not full browser or scene-flow proof by itself.
- `runtime-browser-smoke.json` is the current browser-backed proof artifact for the live owl interaction, wrong-answer retry, second-problem follow-up, and overlay close path.
- `runtime-browser-smoke.json` is not telemetry-backed pedagogy proof and not an independent calibration study for the frozen ELO bands.

## Live Vs Generated Vs Archived

Authoritative inputs:
- runtime code in `src/**`
- authored level specs in `public/data/levels/specs/*.spec.json`
- registries, tuning, math pools, defaults, schemas, and i18n defaults in `public/data/**`
- referenced assets in `public/assets/**`

Generated outputs:
- compiled levels in `public/data/levels/compiled/*.json`
- build output in `dist/`

Staging or workflow areas:
- `ai_assets/`: raw audio staging and workflow notes, not runtime truth

Archived and non-live areas:
- `archived/**`
- archived asset copies
- archived dead code
- archived historical planning docs

Rules:
- do not hand-edit compiled levels unless you are debugging the compiler
- do not assume every file under `public/assets/**` is live unless BootScene, a registry, or a manifest references it
- do not copy material back out of `archived/**` without a deliberate restore plan

## State Reset

Clear only the minimum relevant keys:

- `crow_profiles`
- `crow_active_user`
- `crow_family_id`
- `crow_save_<username>`
- `crow_save_v1`
- `crow_translations`
- `crow_learner_api_base`
- `crow_learner_snapshot_<childId>`
- `crow_learner_pending_attempts_<childId>`

Guidance:
- clear `crow_translations` only for translation override bugs
- clear `crow_active_user` if boot routing is wrong but profiles should remain
- clear one `crow_save_<username>` for profile-specific save bugs
- clear learner snapshot and pending queue keys when sync or review state is misleading

## External Skills

Optional sibling workspace:

- local example on this machine: `C:\Users\saemundur\Desktop\Dev Projects\agent-skills`

If a local skills workspace is present:
- start at `INDEX.md`
- use `Quick Routing` and `Disambiguation`
- load only the chosen `SKILL.md`
- treat the skills workspace as workflow guidance, not Crow truth

If missing:
- continue with Crow-local docs and code only

## Guardrails

- Boot initialization order matters.
- EventBus coupling matters.
- localStorage can make startup and learner behavior look inconsistent across reloads.
- math behavior now spans multiple systems, not just `ELOManager`.
- compiled levels and archived material are never the first place to edit.

## Before You Change Anything

- confirm the live source file before editing
- confirm whether the doc you opened is Current, Supportive, or Historical
- if touching math or learner systems, read both current architecture docs first
- if touching assets, confirm runtime references
- run the smallest relevant state reset instead of clearing everything
- rerun the right verification loop before handoff
