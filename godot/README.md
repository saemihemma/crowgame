# Crow — Godot 4 port

Status: Current
Authority: Godot project overview and run/test/build commands. Runtime truth lives in `godot/scripts/**`, `godot/data/**`, and `godot/project.godot`.
Last verified against code: 2026-08-23

**The game.** Godot 4.3 / GDScript — the only tree players run. Data and assets
live alongside it in `data/**` and `assets/**`, which are the canonical copies.

It began as a 1:1 port of a Phaser 3 / TypeScript original. That original has been
retired; what survives of it is `math-kernel/**`, the TypeScript reference
implementation of the learner maths, which generates the golden fixtures the
parity tests here assert against.

## Status — feature complete (slices 1–8)
- **Pixel-perfect 960×540** viewport (canvas_items/keep, Nearest filter, gravity 800).
- **Data + autoloads + EventBus**: every JSON loaded; managers ported
  (Save/Profile/Text/Level/Leveling/Theme/Audio) over a `user://` localStorage-equivalent.
- **Adaptive math/learner engine** (highest-fidelity risk): ELOManager, ProblemPoolManager,
  ProblemReplayKey, LearnerStateManager, ELOAwareStrategy, OwlSelection, ELOUpdateManager —
  ported with exact constants and verified against golden values generated from the TS source.
- **Movement feel** (Tier-1): Arcade integration replicated tick-for-tick on a CharacterBody2D
  (coyote/jump-buffer/variable-jump/drag/maxSpeed/terminal), verified against a TS reference.
- **Gameplay**: tilemap dual pipeline (runtime loader + editable level scenes), coins, lives,
  hazards, doors, camera, enemies (cockroach patrol), laser projectile, abilities framework.
- **Owl flow**: NPC components → MathChallenge overlay → a short problem set (600ms retry lockout on a
  first wrong answer) → ELO/learner update → save → optional hosted sync.
- **Cloud save** (`cloud_sync.gd`): debounced save upload, batched attempts, and
  adopt-server-state on conflict, over the same-origin API. Local-only when no API
  is reachable, which is a supported state rather than an error.
- **UI**: HUD (lives/coins/owls/ability chips, milestone bursts), touch controls (mobile),
  Login (PIN dots), MainMenu (build stamp), LevelSelect, Pause, completion screen.
- **Feel**: crow walk animation, NPC name prompt + idle bob, jump dust, enemy death burst,
  projectile trail + muzzle flash, focus highlights, elastic board entrance.
- **Progression**: death fully reloads the level;
  Continue resumes `save.currentLevel`.
- **Tier-3 modularity**: typed level scenes editable in Godot's TileMap editor; runtime
  **skin swap** (forest↔scifi) restyling via palette with no code change.
- **Mobile**: single-threaded Web export in `../output/web/` (plays on any static host).

## Run / test / build
```bash
# Play in the Godot editor: open this folder as a project, F5.
godot --path .

# Headless test suite (65 unit tests + 6 physics integration probes)
bash tools/run_tests.sh

# Regenerate golden parity fixtures from the TS source (when math/movement changes)
npm run godot:gen-math-fixtures        # (from repo root)
npm run godot:gen-motion-fixtures

# Build the mobile Web export -> ../output/web/
bash tools/build_web.sh

# Re-import compiled levels into editable Godot scenes (scenes/levels/*.tscn)
godot --headless --path . --script res://tools/import_level.gd
```

## Layout
- `scripts/boot.gd` — cold-start wiring; `scripts/autoload/` — EventBus,
  Persistence, Config, SceneRouter, Data/Save/Profile/Text/Level/Leveling/Theme/Audio.
- `scripts/math/` — ELOManager, ProblemPoolManager, ProblemReplayKey, ELOAwareStrategy,
  MathProblemManager, OwlSelection.
- `scripts/systems/` — LearnerStateManager, ELOUpdateManager, LevelLoader,
  LearnerSyncService, CloudSync.
- `scripts/entities/` — player, enemy, projectile, coin/hazard/door, npc + components.
- `scripts/ui/` — hud, touch_controls, math_challenge, cloud_panel,
  parent_report, fx/dopamine_fx.
- The API this talks to lives in `../server/**`; the contract is
  `../docs/API_CONTRACT.md`.
- `scripts/scenes/` — game, main_menu, level_select, login, pause.
- `tests/` — zero-dependency headless harness; `tests/fixtures/` golden values; `tests/integration/` probes.
- `data/`, `assets/` — verbatim copies of the source content.

## Fidelity notes (intentional deviations)
- **Behavioral parity (exact):** math/learner numbers, save shape + storage keys, data formats,
  movement feel — verified by golden-value tests.
- **Experience parity (ported feel, Godot-native):** screen shake, damage flash, dopamine
  particles, dialog/menus are implemented with Godot tweens/GPUParticles2D/shaders rather than
  transliterating the original's draw calls.
- Cloud sync is off until a device is enrolled, and then talks only to
  a same-origin `/api/v1`, proxied per environment. `crow_learner_api_base` is a
  debug-only override and is NOT a way to point a shipped build at a backend —
  see `../docs/API_CONTRACT.md`.
- Web build is single-threaded for static-host/mobile compatibility.
- Deliberately not carried over: the old `admin.html` translation editor (a live
  string editor is not something to ship publicly) and the multi-threaded web
  export. The learner dashboard it also held now exists in-engine as the parent
  report.
