# Hörmann

Status: Current
Authority: Repo entrypoint and navigation only. Runtime truth lives in
`godot/scripts/**`, `godot/data/**`, `godot/project.godot`, and `server/src/**`.
Last verified against code: 2026-08-25

Hörmann is a child-first educational platformer for early-elementary maths
practice. Built for one seven-year-old first, and now for other people's
children too.

## The docs

Six files, on purpose. If you are adding a seventh, read the doc hygiene note at
the end of [ONBOARDING.md](./ONBOARDING.md) first.

| Read | For |
| --- | --- |
| [ONBOARDING.md](./ONBOARDING.md) | the working map, the verification loop, the footguns, and the only place mutable counts live |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | system shape, the maths engine, save and sync, the frozen wire contract, the sprite contract, the authoring pipeline |
| [PRODUCT.md](./PRODUCT.md) | what the game is trying to be, and the design commitments behind it |
| [roadmap.md](./roadmap.md) | open work only — finished items are deleted, and `npm run validate` enforces that |
| [deploy/RAILWAY.md](./deploy/RAILWAY.md) | staging, prod, promotion, rollback |
| [brand/](./brand/) | art direction, the pixel law, and the level art bible |

For parents: **[PRIVACY.md](./PRIVACY.md)** says in plain language what the game
stores about a child, what leaves the device, and how to delete all of it. To
report something privately, see [SECURITY.md](./SECURITY.md). To contribute, see
[CONTRIBUTING.md](./CONTRIBUTING.md).

Finished work is recorded in git history, not in a progress file.

## What this repo contains

Four trees, four different jobs. Getting them confused is the easiest way to do
work that never ships, so they are stated first:

| Tree | What it is | Ships? |
| --- | --- | --- |
| `godot/**` | **The game.** Godot 4.3 / GDScript. The only tree players run. | yes, as `output/web` |
| `server/**` | **The API.** Node 22 + TypeScript + Postgres: cloud save, family auth, error ingestion. | yes, as a Railway service |
| `math-kernel/**` | **The reference kernel.** TypeScript implementation of ELO, learner state and problem selection. | never |
| `tools/**` | Offline authoring and validation for the maths curriculum. | never |

`math-kernel/` is not dead code and not a second game. It generates
`godot/tests/fixtures/*.json`, which the Godot parity tests assert against —
making it the executable specification for the learner maths — and it drove the
pipeline that produced the curriculum the game ships. CI fails if the committed
fixtures no longer match what it produces.

## Run it

```bash
# The game, in the Godot editor (Godot 4.3)
godot --path godot

# The full gate: hardcode guard + unit tests + 6 physics probes
bash godot/tools/run_tests.sh

# The web build players get
bash godot/tools/build_web.sh          # -> output/web/
node godot/tools/web_boot_smoke.mjs    # proves the EXPORT boots, not just source

# The API (needs Postgres)
npm --prefix server ci
DATABASE_URL=postgres://... npm --prefix server run migrate
DATABASE_URL=postgres://... npm --prefix server test

# The offline toolchain
npm ci && npm run typecheck && npm run validate
```

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

**2, 3, 4 and 6 are enforced.** `godot/tools/check_hardcoding.py` runs in CI and
fails the build on them. Genuine exceptions take `# hardcode-ok` on the line.

**1 and 5 are conventions, checked by review, not by that script.** This section
used to say the guard "rejects all six". It rejected two, and its own docstring
disclaimed rule 1 as "no flaky numeric scanning" — while rule 6 was violated in
four places in shipped code, three of them in the pause menu. Numeric scanning
cannot separate a tuning constant from an array index without a false-positive
rate that gets the guard switched off, and whether a `match` dispatches on
content or on an enum is a judgment a regex does not have. The Tier-1 constants
are covered instead by golden-value tests, which is a stronger check than a
grep would be.

The four rule-6 violations were also all silent no-ops — they named an `ui_click`
sfx key that is not in `audio_manifest.json`, so the manifest lookup returned
nothing and no sound played. They now fire `play_event("button")`, which is the
press sound the manifest actually ships, so **the language toggle and the three
pause-menu buttons click where they used to be silent.**

**The one carve-out:** Tier-1 constants (ELO, learner state, movement) stay in
code, not tuning JSON, and are locked by golden-value tests. They decide how hard
the game feels to a child, and moving them somewhere editable would invite
exactly the silent drift the fixtures exist to catch.

## What is deliberately not true here

Stated plainly, because each of these has misled someone:

- **The 4-digit PIN is not security.** It is a "which kid am I" selector on a
  shared family device. It is never sent to the server, never verified remotely,
  and `ProfileManager._hash_pin()` is reversible base64 despite the name.
- **The shipped problem total is not the owl path.** The fresh opening owl path
  starts with `addition` plus `counting`; the rest unlocks through normal
  progression. Use `reports/math-batches/owl-surface-summary.json` for the
  owl-safe subset.
- **The Apache-2.0 licence covers code and data, not art and audio.** Assets
  under `godot/assets/**` have their own terms — see [NOTICE](./NOTICE) and
  [LICENSE_ATTRIBUTIONS.md](./LICENSE_ATTRIBUTIONS.md). Do not assume an asset is
  redistributable because the code is.

Mutable numeric repo counts live in one place only:
[ONBOARDING.md](./ONBOARDING.md). Architecture docs describe behaviour and
contracts, and avoid repeating counts unless the number is itself the rule.
