# Crow

Status: Current
Authority: Repo entrypoint and navigation only. Runtime truth lives in
`godot/scripts/**`, `godot/data/**`, `godot/project.godot`, and `server/src/**`.
Last verified against code: 2026-08-24

Crow is a child-first educational platformer for early-elementary maths practice.
Built for one seven-year-old first, and now for other people's children too.

## What this repo contains

Four trees, with four different jobs. Getting these confused is the single
easiest way to do work that never ships, so they are stated first:

| Tree | What it is | Ships? |
| --- | --- | --- |
| `godot/**` | **The game.** Godot 4.3 / GDScript. The only tree players run. | yes, as `output/web` |
| `server/**` | **The API.** Node 22 + TypeScript + Postgres: cloud save, family auth, error ingestion. | yes, as a Railway service |
| `math-kernel/**` | **The reference kernel.** TypeScript implementation of ELO, learner state and problem selection. | never |
| `tools/**` | Offline authoring and validation for the maths curriculum. | never |
| `src/`, `public/`, `vite/`, `admin.html` | **Dead.** The retired Phaser game and its data twin, pending deletion. Nothing references or builds them. | no — ignore entirely |

`math-kernel/` is not dead code and not a second game. It has two jobs: it
generates `godot/tests/fixtures/*.json`, which the Godot parity tests assert
against — making it the executable specification for the learner maths — and it
drives the offline pipeline that produced the 2,885-problem curriculum the game
ships. CI fails if the committed fixtures no longer match what it produces.

## Start here

1. [ONBOARDING_AGENT.md](./ONBOARDING_AGENT.md) — the working map, and the only
   place mutable repo counts live
2. [godot/ARCHITECTURE.md](./godot/ARCHITECTURE.md) — the conventions the game is
   held to, and the CI guard that enforces them
3. [MATH_SYSTEM_ARCHITECTURE.md](./MATH_SYSTEM_ARCHITECTURE.md) — how difficulty
   adapts to a child
4. [docs/API_CONTRACT.md](./docs/API_CONTRACT.md) — the client/server contract,
   and why each part of it is the way it is
5. [docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md](./docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md)
   — learner state, saves, and cloud sync
6. [deploy/RAILWAY.md](./deploy/RAILWAY.md) — staging, prod, promotion, rollback
7. [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) — the verification loop every
   change ships against
8. [CONTRIBUTING.md](./CONTRIBUTING.md) — what a good change looks like here

For parents: **[PRIVACY.md](./PRIVACY.md)** says in plain language what the game
stores about a child, what leaves the device, and how to delete all of it. To
report something privately, see [SECURITY.md](./SECURITY.md).

## Run it

```bash
# The game, in the Godot editor (Godot 4.3)
godot --path godot

# The full gate: hardcode guard + 65 unit tests + 6 physics probes
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

## Change routing

| Changing | Read first |
| --- | --- |
| difficulty, review, or unlock logic | [MATH_SYSTEM_ARCHITECTURE.md](./MATH_SYSTEM_ARCHITECTURE.md) |
| ELO / learner / movement constants (**Tier-1**) | [godot/ARCHITECTURE.md](./godot/ARCHITECTURE.md) — regenerate fixtures in the same commit |
| curriculum content or authoring | [docs/MATH_AUTHORING_PIPELINE.md](./docs/MATH_AUTHORING_PIPELINE.md) |
| saves, profiles, cloud sync | [docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md](./docs/LEARNER_STATE_AND_SYNC_ARCHITECTURE.md) |
| anything crossing client and server | [docs/API_CONTRACT.md](./docs/API_CONTRACT.md) — it is frozen on purpose |
| deployment, environments, rollback | [deploy/RAILWAY.md](./deploy/RAILWAY.md) |
| tuning numbers, strings, colours, spawns | edit `godot/data/**`, never a `.gd` file |
| runtime assets | [ASSET_SPECS.md](./ASSET_SPECS.md) |
| product intent and tone | [PROJECT.md](./PROJECT.md) |

## The rules that will bite you

These are enforced, not aspirational. `godot/tools/check_hardcoding.py` runs in
CI and rejects all six:

1. No magic numbers in `.gd` — they live in `godot/data/tuning/*.json`, read via
   `Config`.
2. No user-facing strings in `.gd` — `TextManager.t("key")`, with the Icelandic
   locale kept key-for-key in lockstep (a test enforces it).
3. No inline colours — `ThemeManager.get_color_value("role")`.
4. No hardcoded scene paths — `SceneRouter.goto("name")`.
5. No type-to-behaviour switches for content — new level objects come from
   `spawn_registry.json` plus a scene with `setup_from_spawn(spawn)`.
6. No scattered `play_sfx("key")` — fire semantic events via
   `AudioManager.play_event("coin")`.

Genuine exceptions take `# hardcode-ok` on the line.

**The one carve-out:** Tier-1 constants (ELO, learner state, movement) stay in
code, not tuning JSON, and are locked by golden-value tests. They are the part
that decides how hard the game feels to a child, and moving them somewhere
editable would invite exactly the silent drift the fixtures exist to catch.

## What is deliberately not true here

Stated plainly, because each of these has misled someone:

- **The 4-digit PIN is not security.** It is a "which kid am I" selector on a
  shared family device. It is never sent to the server, never verified remotely,
  and `ProfileManager._hash_pin()` is reversible base64 despite the name.
- **`3000` is total shipped problem inventory, not the owl path.**
  The fresh opening owl path currently starts with `addition` plus `counting`; the rest unlocks through normal progression.
  Use `reports/math-batches/owl-surface-summary.json` for the owl-safe subset.
- **The Apache-2.0 licence covers code and data, not art and audio.** Assets under
  `godot/assets/**` have their own terms — see [NOTICE](./NOTICE) and
  [LICENSE_ATTRIBUTIONS.md](./LICENSE_ATTRIBUTIONS.md). Do not assume an asset is
  redistributable because the code is.
- **`archived/**` is not current.** It is preserved history, not runtime truth.
- **`docs/learner_backend_schema.sql` is a superseded draft.** The real schema is
  `server/migrations/**`; the draft contains a `pin_hash` column that must never
  be built.

## Truth tiers

| Tier | Where |
| --- | --- |
| Live runtime | `godot/scripts/**`, `godot/data/**`, `godot/assets/**` (referenced files), `server/src/**` |
| Contract | `docs/API_CONTRACT.md`, `server/migrations/**`, `godot/tests/fixtures/**` |
| Generated | `godot/data/levels/compiled/*.json`, `output/web/**`, `server/dist/**` |
| Never shipped | `math-kernel/**`, `tools/**`, `godot/tests/**` |
| Staged | `ai_assets/**` |
| Historical | `archived/**` |

Mutable numeric repo counts live in one place only:
[ONBOARDING_AGENT.md](./ONBOARDING_AGENT.md). Architecture docs describe behaviour
and contracts, and avoid repeating counts unless the number is itself the rule.
