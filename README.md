# Hörmann

Status: Current
Authority: Repo entrypoint and navigation only. Runtime truth lives in
`godot/scripts/**`, `godot/data/**`, `godot/project.godot`, and `server/src/**`.

Hörmann is a child-first educational platformer for early-elementary maths
practice. Built for one seven-year-old first, and now for other people's
children too.

## Four trees, four jobs

Getting these confused is the easiest way to do work that never ships, so they
come first.

| Tree | What it is | Ships? |
| --- | --- | --- |
| `godot/**` | **The game.** Godot 4.3 / GDScript. The only tree players run. | yes, as `output/web` |
| `server/**` | **The API.** Node 22 + TypeScript + Postgres: cloud save, family auth, error ingestion. | yes, as a Railway service |
| `math-kernel/**` | **The reference kernel.** TypeScript implementation of ELO, learner state and problem selection. | never |
| `tools/**` | Offline authoring and validation for the maths curriculum, and the localisation CMS (`npm run cms`). | never |

`math-kernel/` is not dead code and not a second game: it generates
`godot/tests/fixtures/*.json`, which the Godot parity tests assert against, so it
is the executable specification for how difficulty adapts. CI fails if the
committed fixtures no longer match what it produces.

## Run it

```bash
godot --path godot                     # the game, in the editor (Godot 4.3)
bash godot/tools/run_tests.sh          # the gate: guard + unit tests + physics probes
npm ci && npm run typecheck && npm run validate
```

Everything else — the web build, the API against Postgres, the curriculum
toolchain — is in [ONBOARDING.md](./ONBOARDING.md) under "The loop".

## The docs

| Read | For |
| --- | --- |
| [ONBOARDING.md](./ONBOARDING.md) | the working map: which tree, which loop, where truth lives, what will bite you |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | the contracts — the maths engine, save and sync, the wire contract, the sprite contract, the authoring pipeline |
| [PRODUCT.md](./PRODUCT.md) | what the game is trying to be, and the commitments behind it |
| [roadmap.md](./roadmap.md) | open work only — finished items are deleted, and `npm run validate` enforces that |
| [deploy/RAILWAY.md](./deploy/RAILWAY.md) | staging, prod, promotion, rollback |
| [brand/](./brand/) | art direction, the pixel law, and the level art bible |
| [brand/SOUND_DESIGN.md](./brand/SOUND_DESIGN.md) | every sound the game makes, what it is for, and how to swap the file |

For parents: **[PRIVACY.md](./PRIVACY.md)** says in plain language what the game
stores about a child, what leaves the device, and how to delete all of it. To
report something privately, see [SECURITY.md](./SECURITY.md). To contribute, see
[CONTRIBUTING.md](./CONTRIBUTING.md).

Finished work is recorded in git history, not in a progress file. The docs state
contracts, not inventory — you will not find a count of levels or sounds in them,
because that is what the data is for.

## The rules that will bite you

1. No magic numbers in `.gd` — they live in `godot/data/tuning/*.json`, read via
   `Config`.
2. No user-facing strings in `.gd` — `TextManager.t("key")`, with the Icelandic
   locale kept key-for-key in lockstep.
3. No inline colours — `ThemeManager.get_color_value("role")`.
4. No ad-hoc scene navigation — `SceneRouter.goto("name")`, never
   `change_scene_to_file` outside `scene_router.gd`.
5. No type-to-behaviour switches for content — new level objects come from
   `spawn_registry.json` plus a scene with `setup_from_spawn(spawn)`.
6. No scattered `play_sfx("key")` — fire semantic events via
   `AudioManager.play_event("coin")`, mapped in `data/audio/sound_events.json`.

**2, 3, 4 and 6 are enforced** by `godot/tools/check_hardcoding.py` in CI.
Genuine exceptions take `# hardcode-ok` on the line. **1 and 5 are conventions
checked by review**: numeric scanning cannot tell a tuning constant from an array
index, and whether a `match` dispatches on content or on an enum is a judgment a
regex does not have.

**The one carve-out:** Tier-1 constants (ELO, learner state, movement) stay in
code rather than tuning JSON, locked by golden-value tests. They decide how hard
the game feels to a child, and making them editable would invite exactly the
silent drift the fixtures exist to catch.

## Two things that have misled people

- **The 4-digit PIN is not security.** It is a "which kid am I" selector on a
  shared family device. The game does check it, but it never reaches the server,
  `_hash_pin()` is reversible by inspection, and clearing site data bypasses it.
  See [PRIVACY.md](./PRIVACY.md).
- **The Apache-2.0 licence covers code and data, not art and audio.** Assets
  under `godot/assets/**` have their own terms — see [NOTICE](./NOTICE) and
  [LICENSE_ATTRIBUTIONS.md](./LICENSE_ATTRIBUTIONS.md). Do not assume an asset is
  redistributable because the code is.
