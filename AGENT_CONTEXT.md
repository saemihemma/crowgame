# Hörmann Agent Context

Status: Supportive
Authority: Practical working notes. Code and data outrank this file.
Last verified against code: 2026-08-25

## Read this after onboarding

For the map and the counts, read [ONBOARDING_AGENT.md](./ONBOARDING_AGENT.md)
first. This file is the stuff you only learn by breaking something: hotspots,
debugging order, and the traps this repo actually sets.

## Quick working model

- `Boot.tscn` is the entry scene; the wiring lives in the autoload list in
  `godot/project.godot`, and the order there matters.
- `game.gd` is the gameplay coordinator — level load, spawns, coins, lives,
  hazards, doors, camera, death, and hosting the maths overlay.
- Maths progression spans `math_problem_manager.gd`, `elo_manager.gd`,
  `learner_state_manager.gd`, `elo_update_manager.gd`, `owl_selection.gd`.
- Maths *teaching* is a separate stack: `concept_ladder.gd` (what a step means),
  `tutorial_manager.gd` (who has been taught what), `math_tutorial.gd` and
  `tutorial_visual.gd` (the lesson itself). Data in `godot/data/curriculum/**`.
- Saves are profile-scoped, never global: `crow_save_<username>`.
- `cloud_sync.gd` layers cloud upload on top of local saving. It does not replace
  it, and it deliberately runs on a slower clock.

## Open Work Lives in roadmap.md

`roadmap.md` is the single list of what is still to do. It carries hard rules at
the top: **finished items are deleted from it, never ticked off or annotated**,
and what you actually did goes in `progress.md`. `npm run validate` fails the
build if the roadmap picks up checkboxes, strikethrough, "(done)" notes or a
completed-work heading, or if the rules block is removed.

Before starting work, read it. After finishing work, the roadmap should be
shorter.

## Quick working model

- `godot/scripts/boot.gd` is the wiring hub: it registers autoloads and hands off
  to the first scene.
- `godot/scripts/scenes/game.gd` is the largest gameplay hotspot.
- Maths progression spans `math/math_problem_manager.gd`, `math/elo_manager.gd`,
  `systems/learner_state_manager.gd`, `systems/elo_update_manager.gd` and
  `systems/cloud_sync.gd`.
- Save behaviour is profile-scoped, not global-only.
- The grown-up surfaces are `ui/cloud_panel.gd` and `ui/parent_report.gd`. There is
  no admin page; the retired Phaser `admin.html` is gone.

## Hotspots by area

Gameplay:
- `godot/scripts/scenes/game.gd` (427 lines)
- `godot/scripts/entities/player.gd`, `player_motion.gd`
- `godot/data/tuning/*.json`

Maths and learner:
- `godot/scripts/math/**`
- `godot/scripts/systems/learner_state_manager.gd` (562 lines — **the largest file
  in the repo**)
- `godot/data/math/*.json`

Maths teaching:
- `godot/data/curriculum/concept_ladder.json` — which steps mean which idea
- `godot/data/curriculum/tutorials.json` — the 30 lessons, 120 cards
- `godot/data/tuning/tutorial_tuning.json` — every pixel and colour role of them
- `bash godot/tools/capture_tutorials.sh` renders every card to PNG for review
- read [docs/MATH_CONCEPT_LADDER.md](./docs/MATH_CONCEPT_LADDER.md) first

Profile, save, sync:
- `godot/scripts/autoload/profile_manager.gd`
- `godot/scripts/autoload/save_manager.gd`
- `godot/scripts/systems/cloud_sync.gd` — **the live cloud transport**
- `godot/scripts/systems/learner_sync_service.gd` — the local snapshot cache and
  pending-attempt queue. Its own remote paths are the retired pre-contract shape
  and are inert; do not extend them.

Content:
- `godot/data/levels/specs/*.spec.json` (authored) →
  `godot/data/levels/compiled/*.json` (generated)
- `godot/data/levels/level_registry.json`
- `tools/compile-levels.ts`

Server:
- `server/src/routes/**`, `server/src/lib/**`
- `server/migrations/**`

## Common footguns

Ranked by how much time each one has actually cost:

1. **Editing the wrong tree.** `math-kernel/**` and `tools/**` never ship. A
   perfect fix there changes nothing a player sees.
2. **`learner_state_manager.gd` looks like it wants refactoring. It does not.**
   It is parity-locked against golden fixtures; splitting it risks the silent
   fidelity drift those fixtures exist to catch. Correct the file's length in a
   doc, not the file.
3. **Changing a Tier-1 constant without regenerating fixtures.** CI fails, and
   correctly: the kernel and the game must agree.
4. **Autoload order.** `CloudSync` must come after `SaveManager`,
   `ProfileManager` and `LearnerSyncService`. Reordering the list breaks several
   subsystems at once, and the error rarely points at the reorder.
5. **Assuming a test scene can reset state.** Autoloads hydrate from
   `user://crow_localstorage.json` *before* any scene's `_ready()`, so isolation
   has to happen before the process starts. `run_tests.sh` deletes the store
   between stages for exactly this reason.
6. **Trusting the source suite about the export.** The GDScript suite runs from
   source and cannot see an export-config mistake. `web_boot_smoke.mjs` can, and
   has: it caught a relative URL that `HTTPRequest` rejects, and a shadowed
   variable that broke an autoload entirely.
7. **`HTTPRequest` needs an absolute URL.** A relative `/api/...` path fails at
   runtime with a URL parse error, which is why `CloudSync` resolves the page
   origin first.
8. **Editing compiled levels.** They are generated. Author the spec, then compile.
9. **Teaching state is NOT learner state.** `tutorialsSeen` lives in the
   profile save through `SaveManager`, deliberately not in
   `learner_state_manager.gd`: that file is parity-locked against the kernel's
   golden fixtures and teaching is a product decision that will change often.
   Putting it there would make every lesson tweak a Tier-1 change.
10. **`archived/**` is not runtime.** It is also 54 MiB of the git pack, which is
   why a clone feels heavier than the project is.

## Recommended debug order

1. Confirm which profile is active. Most "impossible" state is another child's
   save.
2. Inspect the store: `user://crow_localstorage.json`. Delete it to get a clean
   slate.
3. If behaviour differs after a reload, suspect autoload initialization order.
4. Check registries and manifests before assuming an asset or content file is
   live — `npm run validate:assets` answers this directly.
5. For anything network-shaped, check the error groups in Postgres before reading
   code: the client reports what players actually hit, grouped, with the build
   commit attached.
6. Only then change runtime code.

## Verification defaults

The canonical loop is in [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md). The short
version:

```bash
bash godot/tools/run_tests.sh     # guard + unit + physics probes
npm run typecheck && npm run validate
```

Add when relevant:

```bash
bash godot/tools/build_web.sh && node godot/tools/web_boot_smoke.mjs
npm --prefix server test          # needs DATABASE_URL
npm run compile                   # after editing a level spec
```

Manual smoke is still required for scene transitions, learner-state behaviour
over several sessions, and anything that has to be felt rather than asserted —
movement, difficulty pacing, whether a moment lands.

## Doc hygiene rule

If a change affects scene count, level count, pool count, answer modes, storage
keys, or the shape of anything on the wire, update the relevant current doc in the
same commit. Counts belong in
[ONBOARDING_AGENT.md](./ONBOARDING_AGENT.md) and nowhere else; wire shape belongs
in [docs/API_CONTRACT.md](./docs/API_CONTRACT.md). `npm run validate:docs`
enforces a good deal of this, and it is not shy about it.
