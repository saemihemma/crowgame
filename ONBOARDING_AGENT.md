# Crow Agent Onboarding

Status: Current
Authority: The working map, plus the ONLY canonical numeric snapshot in the docs.
Runtime truth still outranks this file — if they disagree, the code is right and
this file is stale.
Last verified against code: 2026-08-24

## Purpose

Get a new contributor — human or agent — productive without reading the whole
repo, and without editing the wrong tree.

What this is:
- the shortest accurate map of what exists
- the canonical place for mutable counts
- the routing table from "I want to change X" to "read Y first"

What this is not:
- not the product brief (that is [PROJECT.md](./PROJECT.md))
- not the conventions the game is held to (that is
  [godot/ARCHITECTURE.md](./godot/ARCHITECTURE.md))
- not the client/server contract (that is [docs/API_CONTRACT.md](./docs/API_CONTRACT.md))

## First: which tree are you in?

This repo holds a game, an API, a reference kernel and an offline toolchain. The
most expensive mistake available here is writing correct, well-tested code in a
tree that never ships.

```
godot/**        THE GAME.       Godot 4.3 / GDScript. Players run this.
server/**       THE API.        Node 22 + TS + Postgres. Cloud save, auth, errors.
math-kernel/**  THE SPEC.       TS reference for ELO/learner/selection. Never ships.
tools/**        THE FACTORY.    Offline curriculum authoring + validation. Never ships.

src/  public/  vite/  admin.html   DEAD. Pending deletion. Nothing references
                                   them, nothing builds them. If a search leads
                                   you here, you are in the retired Phaser game.
archived/**                        History. Not runtime, not current, do not cite.
```

`math-kernel/` earns its keep two ways: it generates
`godot/tests/fixtures/*.json`, which `test_math_parity.gd` and
`test_motion_parity.gd` assert against — so it is the executable specification for
how difficulty adapts — and it produced the curriculum the game ships. A CI job
regenerates the fixtures and fails on any diff, so a Tier-1 change must
regenerate them in the same commit.

## First 15 minutes

```bash
# 1. Is the tree healthy?
bash godot/tools/run_tests.sh        # guard + unit + physics probes
npm ci && npm run typecheck && npm run validate

# 2. Does the thing players get actually work?
bash godot/tools/build_web.sh
node godot/tools/web_boot_smoke.mjs

# 3. Play it
godot --path godot                   # F5 in the editor
```

If step 1 is red, stop and fix that first. Green is the contract every change
ships against.

## Dated repo snapshot

Snapshot as of 2026-08-24.
This is the only canonical numeric snapshot block in the current docs.
Refresh it here, and nowhere else, when a count changes.

Game:
- `godot/data/registries/scenes.json` registers 7 scenes: `boot`, `login`, `main_menu`, `level_select`, `game`, `cloud_panel`, `parent_report`
- `godot/data/levels/level_registry.json` contains 6 levels, including `level_99`
  (the maths practice arena)
- `godot/data/npcs/npc_registry.json` contains 1 NPC entry (the owl)
- `godot/data/enemies/enemy_registry.json` contains 1 enemy type (the cockroach)
- `godot/data/audio/audio_manifest.json` currently exposes 5 music tracks and 15 live SFX entries.
- **51** `.gd` scripts under `godot/scripts/`, **24** `.tscn` scenes under `godot/scenes/`
- `godot/data/registries/spawn_registry.json`: **5** spawnable object types
- `godot/data/audio/sound_events.json`: **15** semantic sound events
- `godot/data/i18n/strings_en.json`: **93** keys, matched key-for-key by
  `strings_is.json`
- **18** autoloads, listed in `godot/project.godot` (order matters: `CloudSync` is last)

Maths content — `DataManager` loads 4 math pools totaling 3000 problems:
- `curriculum`: 2885
- `gaps`: 60
- `dataset`: 40
- `easy`: 15

Math UI is currently MCQ-only: every problem is answered by picking one of the
offered options, and `godot/scripts/ui/math_challenge.gd` builds its buttons
straight from `answer.options`.

Blunt boundaries on that `3000`, because it is the number people quote wrongly:

- `3000` is total shipped inventory, **not** the owl path.
- The opening unlocked domains currently `addition` plus `counting`; pattern
  matching joins the owl-safe set later through the normal unlock rules.
- Current shipped owl interaction length is `2` problems per owl encounter, which
  is deliberate repetition, not padding.
- Per-domain progression is tracked as `currentStep` in `curriculumProgress`, and
  selection is capped by that step rather than by raw ELO — a child cannot be
  handed a much harder question just because their rating drifted up.
- For the owl-safe inventory and the fresh-profile subset, use
  `reports/math-batches/owl-surface-summary.json`, not the headline total.

The maths evidence artifacts are a runtime-aligned owl selector smoke.
Precisely: selection-layer evidence built from the shared owl helper plus live learner-state and NPC config.
Worth stating that carefully, because it is not empirical proof that the
difficulty curve suits a particular child — no artifact in this repo claims that.

Server:
- **17** TypeScript sources under `server/src/**`
- **2** migrations: `001_errors.sql`, `002_family_and_save.sql`
- **31** tests, run against a real Postgres

Reference kernel:
- **9** TypeScript sources under `math-kernel/**`
- **2** fixture files under `godot/tests/fixtures/**`

Tests, all in:
- **65** GDScript unit tests, **6** headless physics probes
- **31** server tests
- **2** browser harnesses: `web_boot_smoke.mjs` (the export boots) and
  `error_pipeline_e2e.mjs` (browser → API → Postgres)

## Source-of-truth map

| Question | Answer lives in |
| --- | --- |
| What does the game do at runtime? | `godot/scripts/**` |
| What numbers tune it? | `godot/data/tuning/*.json` |
| What does a player read? | `godot/data/i18n/strings_*.json` |
| Which scenes exist, and how are they reached? | `godot/data/registries/scenes.json` |
| How does difficulty adapt? | `godot/scripts/systems/learner_state_manager.gd` + `godot/scripts/math/**` |
| Is that logic still correct? | `godot/tests/fixtures/**` vs `math-kernel/**` |
| What is stored, where, under which key? | `docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md` |
| What crosses the network? | `docs/API_CONTRACT.md` |
| What is in the database? | `server/migrations/**` |
| How does it get deployed? | `deploy/RAILWAY.md` |

## Actual runtime flow

```
Boot ──▶ Login ("Who's playing?")  ──▶ MainMenu ──▶ LevelSelect ──▶ Game
          │  name + 4-digit PIN                        │
          │  (a selector, NOT auth)                    ├─▶ owl encounter
          ▼                                            │     ├─ 2 problems
   profile save loads                                  │     ├─ ELO + learner update
   learner snapshot restores                           │     └─ save (local, then cloud)
   CloudSync binds the child                           │
   and pulls the cloud save                            └─▶ death: level reloads
```

Autoload order matters and is set in `godot/project.godot`: `Persistence` and
`EventBus` come first, `CloudSync` last, because it depends on `SaveManager`,
`ProfileManager` and `LearnerSyncService` already existing.

## Task routing

| I want to… | Do this |
| --- | --- |
| change a number a player feels | edit `godot/data/tuning/*.json`. Never a `.gd`. |
| add or change a string | edit BOTH `strings_en.json` and `strings_is.json` |
| add a level object type | one entry in `spawn_registry.json` + a scene with `setup_from_spawn(spawn)`. No `game.gd` change. |
| add a sound | `tools/gen_sfx.py` or drop a file → `audio_manifest.json` → `sound_events.json` → `AudioManager.play_event()` |
| change ELO/learner/movement constants | edit `math-kernel/**`, regenerate fixtures, keep Godot parity green, all in one commit |
| add curriculum content | `docs/MATH_AUTHORING_PIPELINE.md`, then `npm run math:materialize` |
| change anything on the wire | `docs/API_CONTRACT.md` first — it is frozen deliberately |
| add a database column | a new forward-only migration; expand/contract, never destructive in the same deploy |
| debug "it works locally but not deployed" | `node godot/tools/web_boot_smoke.mjs`, then the error groups in Postgres |

## Live vs generated vs never-shipped

| Category | Paths | Note |
| --- | --- | --- |
| Live | `godot/scripts/**`, `godot/data/**`, `server/src/**` | edit these |
| Referenced assets | `godot/assets/**` | not every file is live; `npm run validate:assets` checks |
| Generated | `godot/data/levels/compiled/*.json`, `output/web/**`, `server/dist/**` | never hand-edit |
| Never shipped | `math-kernel/**`, `tools/**`, `godot/tests/**` | still gated by CI |
| Staged | `ai_assets/**` | working area |
| Historical | `archived/**` | not current, do not cite |

## State reset

All client state is one JSON document at `user://crow_localstorage.json`
(IndexedDB on web), keyed like the browser localStorage the original build used:

- `crow_profiles`
- `crow_active_user`
- `crow_family_id`
- `crow_save_<username>`
- `crow_save_v1` (legacy)
- `crow_translations`
- `crow_learner_api_base` (debug-only override now; not a shipped setting)
- `crow_learner_snapshot_<childId>`
- `crow_learner_pending_attempts_<childId>`

To reset a local run, delete that file. `run_tests.sh` does exactly this before
each stage, because autoloads hydrate from it **before** any test scene's
`_ready()` — a probe cannot isolate itself from inside the scene tree.

Server-side, a family can erase everything through `DELETE /api/v1/family`, which
cascades.

## Guardrails

- Do not edit `godot/data/levels/compiled/**` — author the spec, then compile.
- Do not move Tier-1 constants into tuning JSON.
- Do not decompose `learner_state_manager.gd` (562 lines, the largest file in the
  repo). It is parity-locked; splitting it risks exactly the silent fidelity drift
  the golden tests exist to catch.
- Do not add a `pin_hash` column, or send the PIN anywhere.
- Do not make the API base configurable from client storage again.
- Do not commit `output/web/*.gz` — the Docker build generates them.

## Before you change anything

1. `bash godot/tools/run_tests.sh` is green.
2. You know which of the four trees you are in.
3. If it is Tier-1, you know you must regenerate fixtures in the same commit.
4. If it touches the wire, you have read `docs/API_CONTRACT.md`.
5. If it changes a count in the snapshot above, you will update it here.
