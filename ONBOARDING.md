# Onboarding

Status: Current
Authority: The working map, plus the ONLY canonical numeric snapshot in the docs.
Runtime truth still outranks this file — if they disagree, the code is right and
this file is stale.
Last verified against code: 2026-08-25

Get productive without reading the whole repo, and without editing the wrong
tree. For *why* the game exists, read [PRODUCT.md](./PRODUCT.md). For how the
system is shaped, read [ARCHITECTURE.md](./ARCHITECTURE.md).

## First: which tree are you in?

The most expensive mistake available here is writing correct, well-tested code in
a tree that never ships.

```
godot/**        THE GAME.       Godot 4.3 / GDScript. Players run this.
server/**       THE API.        Node 22 + TS + Postgres. Cloud save, auth, errors.
math-kernel/**  THE SPEC.       TS reference for ELO/learner/selection. Never ships.
tools/**        THE FACTORY.    Offline curriculum authoring + validation. Never ships.
```

The retired Phaser tree (`src/`, `public/`, `vite/`, `admin.html`) and
`archived/` are **deleted**, not merely unused. If a doc or comment still points
at them, that reference is stale.

`math-kernel/` earns its keep twice: it generates `godot/tests/fixtures/*.json`,
which the parity tests assert against, and it produced the curriculum the game
ships. CI regenerates the fixtures and fails on any diff, so a Tier-1 change must
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

Snapshot as of 2026-08-25.
This is the only canonical numeric snapshot block in the current docs.
Refresh it here, and nowhere else, when a count changes.

Every number below is **derived from the data by `npm run validate:docs`**, which
fails if the prose and the data disagree. That is deliberate, and it is why the
counts that used to live here in prose alone — script counts, scene-file counts,
test counts — are gone rather than restated: they drifted every time, silently,
because nothing computed them. Count those with `git ls-files` when you need
them; do not write them down.

Game:
- `godot/data/registries/scenes.json` registers 7 scenes: `boot`, `login`,
  `main_menu`, `level_select`, `game`, `cloud_panel`, `parent_report`
- `godot/data/levels/level_registry.json` contains 6 levels, including `level_99`
  (the maths practice arena)
- `godot/data/npcs/npc_registry.json` contains 6 NPC entries (owl variants:
  teacher, gentle, tough, twin chain, triple chain, gauntlet)
- `godot/data/enemies/enemy_registry.json` contains 1 enemy type (the cockroach)
- `godot/data/audio/audio_manifest.json` currently exposes 5 music tracks and 16 live SFX entries.
- `godot/data/registries/spawn_registry.json`: **5** spawnable object types
- `godot/data/audio/sound_events.json`: **16** semantic sound events
- `godot/data/i18n/strings_en.json`: **294** keys, matched key-for-key by
  `strings_is.json`
- **19** autoloads, listed in `godot/project.godot` (order matters: `CloudSync` is last)

Maths content — `DataManager` loads 4 math pools totaling 3150 problems:
- `curriculum`: 3035
- `gaps`: 60
- `dataset`: 40
- `easy`: 15

Server:
- **2** migrations: `001_errors.sql`, `002_family_and_save.sql`

Tests:
- the GDScript suite plus **6** headless physics probes, all via
  `bash godot/tools/run_tests.sh`
- the server suite against a real Postgres, via `npm --prefix server test`
- **2** browser harnesses: `web_boot_smoke.mjs` (the export boots) and
  `error_pipeline_e2e.mjs` (browser → API → Postgres)

### The one number people quote wrongly

`3150` is **total shipped inventory, not the owl path.**

- The opening unlocked domains are `addition` plus `counting`; pattern matching
  joins the owl-safe set later through the normal unlock rules.
- Shipped owl interaction length is `1` problem per encounter. `problemCount` is
  per-NPC, so a future gated owl can ask more.
- Selection is capped by `currentStep` in `curriculumProgress`, not raw ELO — a
  child cannot be handed a much harder question because their rating drifted up.
- For the owl-safe inventory and the fresh-profile subset, use
  `reports/math-batches/owl-surface-summary.json`.

No artifact in this repo claims the difficulty curve suits a particular child.
The maths evidence is selection-layer rail safety, not pedagogy.

## Source-of-truth map

| Question | Answer lives in |
| --- | --- |
| What does the game do at runtime? | `godot/scripts/**` |
| What numbers tune it? | `godot/data/tuning/*.json` |
| What does a player read? | `godot/data/i18n/strings_*.json` |
| Which scenes exist, and how are they reached? | `godot/data/registries/scenes.json` |
| How does difficulty adapt? | `godot/scripts/systems/learner_state_manager.gd` + `godot/scripts/math/**` |
| Is that logic still correct? | `godot/tests/fixtures/**` vs `math-kernel/**` |
| What is stored, where, under which key? | [ARCHITECTURE.md](./ARCHITECTURE.md#identity-save-and-sync) |
| What crosses the network? | [ARCHITECTURE.md](./ARCHITECTURE.md#the-wire-contract) |
| What is in the database? | `server/migrations/**` |
| How does it get deployed? | [deploy/RAILWAY.md](./deploy/RAILWAY.md) |

## Actual runtime flow

```
Boot ──▶ Login ("Who's playing?")  ──▶ MainMenu ──▶ LevelSelect ──▶ Game
          │  name + 4-digit PIN                        │
          │  (a selector, NOT auth)                    ├─▶ owl encounter
          ▼                                            │     ├─ 1 problem
   profile save loads                                  │     ├─ ELO + learner update
   learner snapshot restores                           │     └─ save (local, then cloud)
   CloudSync binds the child                           │
   and pulls the cloud save                            └─▶ death: level reloads
```

## Task routing

| I want to… | Do this |
| --- | --- |
| change a number a player feels | edit `godot/data/tuning/*.json`. Never a `.gd`. |
| add or change a string | edit BOTH `strings_en.json` and `strings_is.json` |
| add a level object type | one entry in `spawn_registry.json` + a scene with `setup_from_spawn(spawn)`. No `game.gd` change. |
| add a sound | `tools/gen_sfx.py` or drop a file → `audio_manifest.json` → `sound_events.json` → `AudioManager.play_event()` |
| add a sprite | `python3 godot/tools/check_assets.py --spec`, then [the sprite contract](./ARCHITECTURE.md#the-sprite-contract) |
| change ELO/learner/movement constants | edit `math-kernel/**`, regenerate fixtures, keep Godot parity green, all in one commit |
| add curriculum content | [the authoring pipeline](./ARCHITECTURE.md#the-math-authoring-pipeline), then `npm run math:materialize` |
| change anything on the wire | [the wire contract](./ARCHITECTURE.md#the-wire-contract) first — it is frozen deliberately |
| add a database column | a new forward-only migration; expand/contract, never destructive in the same deploy |
| debug "works locally, not deployed" | `node godot/tools/web_boot_smoke.mjs`, then the error groups in Postgres |

## Live vs generated vs never-shipped

| Category | Paths | Note |
| --- | --- | --- |
| Live | `godot/scripts/**`, `godot/data/**`, `server/src/**` | edit these |
| Referenced assets | `godot/assets/**` | not every file is live; `npm run validate:assets` checks |
| Contract | `server/migrations/**`, `godot/tests/fixtures/**` | changing these changes installed clients |
| Generated | `godot/data/levels/compiled/*.json`, `output/web/**`, `server/dist/**` | never hand-edit |
| Never shipped | `math-kernel/**`, `tools/**`, `godot/tests/**` | still gated by CI |

## The verification loop

The default change loop:

```bash
bash godot/tools/run_tests.sh          # hardcode guard + unit tests + physics probes
npm run typecheck
npm run validate
godot --path godot                     # then actually play it
```

Add these when the change touches them:

```bash
npm run compile                        # after editing a level spec
bash godot/tools/build_web.sh          # after any change that ships to players
node godot/tools/web_boot_smoke.mjs    # the EXPORT, not the source

DATABASE_URL=postgres://... npm --prefix server run migrate
DATABASE_URL=postgres://... npm --prefix server test
DATABASE_URL=postgres://... node godot/tools/error_pipeline_e2e.mjs

npm run math:materialize               # after curriculum authoring
npm run math:review
```

`npm run validate` covers content, docs, assets, i18n fit and export freshness.
It does **not** cover the game or the API — `run_tests.sh` and
`npm --prefix server test` are separate gates, and CI runs all three.

Why `web_boot_smoke.mjs` is not optional for a shipping change: the GDScript
suite runs from source and structurally cannot see an export-config mistake. It
has already caught a URL the engine rejects at runtime, and a shadowed variable
that broke an autoload entirely — both invisible to every other check here.

Some things still need a human: movement feel, difficulty pacing, whether a
moment lands for a child. Say in your PR what you played and what you saw.

## Footguns, ranked by time actually lost

1. **Editing the wrong tree.** `math-kernel/**` and `tools/**` never ship. A
   perfect fix there changes nothing a player sees.
2. **`learner_state_manager.gd` looks like it wants refactoring. It does not.**
   It is the largest file in the repo and parity-locked against golden fixtures;
   splitting it risks the silent fidelity drift those fixtures exist to catch.
3. **Changing a Tier-1 constant without regenerating fixtures.** CI fails, and
   correctly: the kernel and the game must agree.
4. **Autoload order.** `CloudSync` must come after `SaveManager`,
   `ProfileManager` and `LearnerSyncService`. Reordering breaks several
   subsystems at once, and the error rarely points at the reorder.
5. **Assuming a test scene can reset state.** Autoloads hydrate from
   `user://crow_localstorage.json` *before* any scene's `_ready()`, so isolation
   has to happen before the process starts. `run_tests.sh` deletes the store
   between stages for exactly this reason.
6. **Trusting the source suite about the export.** See `web_boot_smoke.mjs`
   above.
7. **`HTTPRequest` needs an absolute URL.** A relative `/api/...` path fails at
   runtime with a URL parse error, which is why `CloudSync` resolves the page
   origin first.
8. **Editing compiled levels.** They are generated. Author the spec, then
   compile.

### Hotspots

- Gameplay: `godot/scripts/scenes/game.gd`, `entities/player.gd`,
  `entities/player_motion.gd`, `godot/data/tuning/*.json`
- Maths and learner: `godot/scripts/math/**`,
  `systems/learner_state_manager.gd`, `godot/data/math/*.json`
- Profile, save, sync: `autoload/profile_manager.gd`, `autoload/save_manager.gd`,
  `systems/cloud_sync.gd` (the live transport),
  `systems/learner_sync_service.gd` (cache and queue only — its remote paths are
  the retired pre-contract shape and are inert; do not extend them)
- Content: `godot/data/levels/specs/*.spec.json` (authored) →
  `compiled/*.json` (generated), via `tools/compile-levels.ts`
- Grown-up surfaces: `ui/cloud_panel.gd`, `ui/parent_report.gd`. There is no
  admin page.

### Debug order

1. Confirm which profile is active. Most "impossible" state is another child's
   save.
2. Inspect `user://crow_localstorage.json`. Delete it for a clean slate.
3. If behaviour differs after a reload, suspect autoload initialization order.
4. Check registries and manifests before assuming an asset is live —
   `npm run validate:assets` answers this directly.
5. For anything network-shaped, check the error groups in Postgres before reading
   code: the client reports what players actually hit, grouped, with the build
   commit attached.
6. Only then change runtime code.

## Guardrails

- Do not edit `godot/data/levels/compiled/**` — author the spec, then compile.
- Do not move Tier-1 constants into tuning JSON.
- Do not decompose `learner_state_manager.gd`.
- Do not add a `pin_hash` column, or send the PIN anywhere.
- Do not make the API base configurable from client storage again.
- Do not commit `output/web/*.gz` — the Docker build generates them.
- Do not hand-edit `godot/data/math/problems_curriculum.json`.

## Open work, and finished work

[roadmap.md](./roadmap.md) is the single list of what is still open, and it
carries hard rules at the top: **finished items are deleted from it, never ticked
off or annotated.** `npm run validate` fails the build if the roadmap picks up
checkboxes, strikethrough, "(done)" notes or a completed-work heading.

Finished work is recorded in **git history**, which is the changelog. Write the
commit message you would have wanted to read.

Read the roadmap before starting. After finishing, it should be shorter.

## Doc hygiene

The doc set is deliberately small: this file, [ARCHITECTURE.md](./ARCHITECTURE.md),
[PRODUCT.md](./PRODUCT.md), [roadmap.md](./roadmap.md), the compliance set
(`PRIVACY.md`, `SECURITY.md`, `LICENSE_ATTRIBUTIONS.md`, `CONTRIBUTING.md`), the
deploy runbook, and `brand/**` for art direction. Resist adding a ninth.

If a change affects a count in the snapshot above, storage keys, or anything on
the wire, update the doc in the same commit. `npm run validate:docs` enforces a
good deal of this mechanically — counts are computed from the data, not trusted
from prose.
