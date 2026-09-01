# Onboarding

Status: Current
Authority: The working map — which tree, which loop, where truth lives, what will
bite you. Runtime truth outranks this file: if they disagree, the code is right.

Get productive without reading the whole repo, and without editing the wrong
tree. For *why* the game exists, read [PRODUCT.md](./PRODUCT.md). For how the
system is shaped, read [ARCHITECTURE.md](./ARCHITECTURE.md).

This file deliberately states no counts — not how many levels, scenes, sounds or
problems exist. Those change with every feature, and a number in prose is a
number that goes stale silently. The map below says where to look instead.

## First: which tree are you in?

**The most expensive mistake available here is writing correct, well-tested code
in a tree that never ships.** Which tree does what, and which two never ship, is
the table at the top of [README.md](./README.md) — read that before anything else.

`math-kernel/` earns its keep twice: it generates `godot/tests/fixtures/*.json`,
which the parity tests assert against, and it produced the curriculum the game
ships. Change a learner or motion constant there and regenerate the fixtures in
the same commit.

## Source-of-truth map

The most useful table in this file. When you want to know something, look here
before you grep.

| Question | Answer lives in |
| --- | --- |
| What does the game do at runtime? | `godot/scripts/**` |
| What numbers tune it? | `godot/data/tuning/*.json` |
| What does a player read? | `godot/data/i18n/strings_*.json` |
| Which scenes exist, and how are they reached? | `godot/data/registries/scenes.json` |
| Which levels exist? | `godot/data/levels/level_registry.json` — `level_99` is the maths practice arena, not a test fixture |
| Which maths pools exist? | `godot/data/math/` — `curriculum` is what ships; `gaps`, `dataset` and `easy` are supporting sets |
| Which problems an owl may actually ask | `reports/math-batches/owl-surface-summary.json` |
| How does difficulty adapt? | `godot/scripts/systems/learner_state_manager.gd` + `godot/scripts/math/**` |
| Is that logic still correct? | `godot/tests/fixtures/**` vs `math-kernel/**` |
| What is stored, where, under which key? | [ARCHITECTURE.md](./ARCHITECTURE.md#identity-save-and-sync) |
| What crosses the network? | [ARCHITECTURE.md](./ARCHITECTURE.md#the-wire-contract) |
| What is in the database? | `server/migrations/**` |
| How does it get deployed? | [deploy/RAILWAY.md](./deploy/RAILWAY.md) |

## The loop

Run this first. If it is red, stop and fix that before anything else — green is
the contract every change ships against.

```bash
bash godot/tools/run_tests.sh          # hardcode guard + unit tests + physics probes
npm ci && npm run typecheck
npm run validate
godot --path godot                     # then actually play it
```

Add these when the change touches them:

```bash
npm run compile                        # after editing a level spec
bash godot/tools/build_web.sh          # after any change that ships to players
node godot/tools/web_boot_smoke.mjs    # the EXPORT, not the source (--shots <dir> to see every screen)

DATABASE_URL=postgres://... npm --prefix server run migrate
DATABASE_URL=postgres://... npm --prefix server test
DATABASE_URL=postgres://... node godot/tools/error_pipeline_e2e.mjs

npm run math:materialize               # after curriculum authoring
npm run math:review

npm run cms                            # editing what the game SAYS, in either language
```

`npm run cms` serves the localisation editor at
<http://127.0.0.1:4173/admin/cms>. It is the surface for
`godot/data/i18n/strings_*.json`, and it exists because that file hides the one
fact that makes translating this game finishable: the strings are templates and
the numbers in them are parameters, so 629 phrases cover 11 624 problem
renderings. The editor sorts by that number, so the top of the list is the most
valuable work — one edit to `math.expl.rel.taken` is 951 problems.

Three things about it are load-bearing:

- **It runs `tools/validate_i18n.mjs` on every save** — the real one, the same
  330ms run CI does — and rolls the file back untouched if it fails. A
  translation that overflows its pixel box, drops a placeholder or reaches for a
  glyph Godot's font does not have never reaches disk.
- **English is read-only for every `math.*` phrasing.** That side is generated
  from `tools/math_phrasing_catalog.mjs` and round-tripped against every problem
  that uses it; editing it in the bundle would be reverted by
  `npm run math:phrasing`. Icelandic is hand-authored and fully editable.
- **It writes files, not a database.** An edit is a `git diff`, reviewed and
  shipped like any other change. It binds to `127.0.0.1`, has no auth, and lives
  under `tools/`, which never ships — the deployed API deliberately has no
  string editor on it, for the reason in `text_manager.gd`.

`npm run validate` covers content, docs, assets, i18n fit and export freshness.
It does **not** cover the game or the API — `run_tests.sh` and
`npm --prefix server test` are separate gates, and CI runs all three.

Why `web_boot_smoke.mjs` is not optional for a shipping change: the GDScript
suite runs from source and structurally cannot see an export-config mistake. It
has already caught a URL the engine rejects at runtime, and a shadowed variable
that broke an autoload entirely — both invisible to every other check here.

Some things still need a human: movement feel, difficulty pacing, whether a
moment lands for a child. Say in your PR what you played and what you saw.

**Play it at 16:9 as well as on a tablet.** `stretch/aspect=expand` never makes
the viewport smaller than 960x540, but on a 16:9 or wider display it is exactly
540 tall — the tightest the game ever gets, and the shape the daily iPad never
shows you. Full-screen cards go in a `FitBox` for that reason, and
`godot/tests/test_screen_fit.gd` gates it.

## Task routing

| I want to… | Do this |
| --- | --- |
| change a number a player feels | edit `godot/data/tuning/*.json`. Never a `.gd`. |
| add or change a string | `npm run cms` — it edits both locales together and runs the guard on every save. Hand-editing the bundles still works; keep them key-for-key. |
| add a level object type | one entry in `spawn_registry.json` + a scene with `setup_from_spawn(spawn)`. No `game.gd` change. |
| add or replace a sound | [brand/SOUND_DESIGN.md](./brand/SOUND_DESIGN.md) — moment → `sound_events.json` → `audio_manifest.json` → the file |
| hear every sound in a browser | `.	oolsudio_bench.ps1` locally (no password); or `/audio` on the deployed web domain with `CROW_AUDIO_PASSWORD` — see [deploy/RAILWAY.md](./deploy/RAILWAY.md) §2d |
| regenerate the placeholder bank | `npm run audio:sfx` (synthesized, deterministic) |
| commission real sounds | `npm run audio:gen -- --list`, then `--dry-run` before spending anything |
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

## Runtime flow

```
Boot ──▶ Login ("Who's playing?")  ──▶ MainMenu ──▶ LevelSelect ──▶ Game
          │  name + 4-digit PIN                        │
          │  (a selector, NOT auth)                    ├─▶ owl encounter
          ▼                                            │     ├─ ELO + learner update
   profile save loads                                  │     └─ save (local, then cloud)
   learner snapshot restores                           │
   CloudSync binds the child                           └─▶ death: level reloads
   and pulls the cloud save
```

## Footguns, ranked by time actually lost

1. **Editing the wrong tree.** `math-kernel/**` and `tools/**` never ship. A
   perfect fix there changes nothing a player sees.
2. **`learner_state_manager.gd` looks like it wants refactoring. It does not.**
   It is parity-locked against golden fixtures, and splitting it risks the silent
   fidelity drift those fixtures exist to catch. Length is not why it is
   protected — other files are longer.
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
9. **"Improving coverage" by pushing a child forward.** A report showing
   concepts a learner never reached is the ELO working, not a gap to close. The
   pace belongs to the child; content they do not meet is the accepted cost of
   that, and widening a gate or adding a nudge to raise the number is against
   the design. See [PRODUCT.md](./PRODUCT.md#coverage-is-not-a-goal-and-never-becomes-one)
   — *unreached by this child* is the design, *unreachable by anyone* is a
   defect, and only the second one is yours to fix.

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
deploy runbook, and `brand/**` for art direction. Resist adding to it.

Two rules keep it that way. **Write down contracts, not descriptions** — what
crosses the network, what a storage key means, what a promise to a parent is. A
count of what currently exists is a description, and it belongs in the data, not
in prose. And **if a change touches a storage key, the wire contract or a
compliance claim, update the doc in the same commit**; `npm run validate:docs`
enforces the mechanical part.
