# Contributing to Hörmann

Status: Supportive
Authority: Contribution process. The verification loop itself is
[ONBOARDING.md](./ONBOARDING.md).
Last verified against code: 2026-08-24

Hörmann is a maths game played by young children, including the author's own. That
shapes what a good contribution looks like more than anything else here.

## Before you write code: which tree?

This repo contains four live trees. Getting this wrong is the
most common way to waste an afternoon:

- **`godot/**`** — the game. Godot 4.3 / GDScript. This is what players run.
- **`server/**`** — the API. Node 22 + TypeScript + Postgres.
- **`math-kernel/**`** — the TypeScript reference implementation of the learner
  maths. Never ships. It generates the golden fixtures the game is tested against.
- **`tools/**`** — offline curriculum authoring and validation. Never ships.

[ONBOARDING.md](./ONBOARDING.md) is the map, and the only place
mutable counts live.

## The rules that are enforced

`godot/tools/check_hardcoding.py` runs in CI and will reject:

magic numbers, user-facing strings, inline colours, hardcoded scene paths,
type-to-behaviour switches for content, and scattered `play_sfx` calls in `.gd`
files. Each has a data-driven home — see
[ARCHITECTURE.md](./ARCHITECTURE.md). Genuine exceptions take
`# hardcode-ok` on the line, and "genuine" means brand text or a diagnostic, not
"I was in a hurry".

Strings go in **both** `strings_en.json` and `strings_is.json`. A test enforces
key-for-key lockstep, and a missing key renders as the raw key to a child.

## Things to leave alone

- **`learner_state_manager.gd`.** It is 562 lines and looks like it wants
  splitting. It is locked against golden fixtures because it decides how hard the
  game feels to a child; splitting it risks drift that no test would catch as a
  behaviour change.
- **Tier-1 constants** (ELO, learner, movement). Changing one is legitimate, but
  it means editing `math-kernel/**`, regenerating the fixtures, and keeping Godot
  parity green — all in the same commit.
- **The wire contract.** [ARCHITECTURE.md](./ARCHITECTURE.md#the-wire-contract) is frozen
  deliberately; it is baked into every installed client.

## Things that will not be accepted

- Sending the child's PIN anywhere, or treating it as authentication. It is a
  "which kid am I" selector and reversible by design.
- Making the API base configurable from client storage again.
- Collecting anything about a child beyond a display name. See
  [PRIVACY.md](./PRIVACY.md) — it is a promise, not a description.
- A destructive migration in the same deploy as the code that stops using the
  thing being dropped. Migrations are forward-only and expand/contract;
  [deploy/RAILWAY.md](./deploy/RAILWAY.md) explains why the rollback story
  requires it.
- Skipping, disabling, or quarantining a test to get green.

## Verifying a change

```bash
bash godot/tools/run_tests.sh                          # the game
npm ci && npm run typecheck && npm run validate        # toolchain + docs
DATABASE_URL=postgres://... npm --prefix server test   # the API
```

If your change ships to players, also:

```bash
bash godot/tools/build_web.sh && node godot/tools/web_boot_smoke.mjs
```

That last one is not ceremony. The GDScript suite runs from source and cannot see
an export-config mistake; the boot smoke has already caught two that nothing else
would have.

Some things still need a human: movement feel, difficulty pacing, whether a moment
lands for a child. Say in your PR what you played and what you saw.

## Docs are part of the change

If you change a count, a storage key, an answer mode, or anything on the wire,
update the relevant doc in the same commit. `npm run validate` enforces a good
deal of this mechanically — counts are computed from the data, not trusted from
prose.

## Assets

Code and data are Apache-2.0. **The art and audio are not** — see
[NOTICE](./NOTICE) and [LICENSE_ATTRIBUTIONS.md](./LICENSE_ATTRIBUTIONS.md). Do
not assume an asset is redistributable because the code is, and do not add an
asset without recording its provenance.
