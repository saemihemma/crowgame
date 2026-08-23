# Hörmann — Godot 4 port

A 1:1 port of the Phaser 3 / TypeScript "Hörmann" educational platformer to **Godot 4.3
(GDScript)**, built self-contained in this folder. Data and assets are reused verbatim
from `public/data/**` and `public/assets/**`.

## Status — feature complete (slices 1–8)
- **Pixel-perfect 960×540** viewport (canvas_items/keep, Nearest filter, gravity 800).
- **Data + autoloads + EventBus**: every JSON loaded (3000 math problems); managers ported
  (Save/Profile/Text/Level/Leveling/Theme/Audio) over a `user://` localStorage-equivalent.
- **Adaptive math/learner engine** (highest-fidelity risk): ELOManager, ProblemPoolManager,
  ProblemReplayKey, LearnerStateManager, ELOAwareStrategy, OwlSelection, ELOUpdateManager —
  ported with exact constants and verified against golden values generated from the TS source.
- **Movement feel** (Tier-1): Arcade integration replicated tick-for-tick on a CharacterBody2D
  (coyote/jump-buffer/variable-jump/drag/maxSpeed/terminal), verified against a TS reference.
- **Gameplay**: tilemap dual pipeline (runtime loader + editable level scenes), coins, lives,
  hazards, doors, camera, enemies (cockroach patrol), laser projectile, abilities framework.
- **Owl flow**: NPC components → MathChallenge overlay → 2 problems (600ms retry lockout on a
  first wrong answer) → ELO/learner update → save → optional hosted sync.
- **LearnerSyncService**: snapshot cache + pending-attempt queue with identical storage keys;
  local-only by default, hosted sync via `crow_learner_api_base` when configured.
- **UI**: HUD (lives/coins/owls/ability chips, milestone bursts), touch controls (mobile),
  Login (PIN dots), MainMenu (build stamp), LevelSelect, Pause, completion screen.
- **Feel**: crow walk animation, NPC name prompt + idle bob, jump dust, enemy death burst,
  projectile trail + muzzle flash, focus highlights, elastic board entrance.
- **Progression parity**: death fully reloads the level (Phaser `scene.restart()` semantics);
  Continue resumes `save.currentLevel`.
- **Tier-3 modularity**: typed level scenes editable in Godot's TileMap editor; runtime
  **skin swap** (forest↔scifi) restyling via palette with no code change.
- **Mobile**: single-threaded Web export in `../output/web/` (plays on any static host).

## Run / test / build
```bash
# Play in the Godot editor: open this folder as a project, F5.
godot --path .

# Headless test suite (34 unit tests + 4 physics integration probes)
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
- `scripts/autoload/` — EventBus, Persistence, Data/Save/Profile/Text/Level/Leveling/Theme/Audio.
- `scripts/math/` — ELOManager, ProblemPoolManager, ProblemReplayKey, ELOAwareStrategy,
  MathProblemManager, OwlSelection.
- `scripts/systems/` — LearnerStateManager, ELOUpdateManager, LevelLoader.
- `scripts/entities/` — player, enemy, projectile, coin/hazard/door, npc + components.
- `scripts/ui/` — hud, touch_controls, math_challenge, fx/dopamine_fx.
- `scripts/scenes/` — game, main_menu, level_select, login, pause.
- `tests/` — zero-dependency headless harness; `tests/fixtures/` golden values; `tests/integration/` probes.
- `data/`, `assets/` — verbatim copies of the source content.

## Fidelity notes (intentional deviations)
- **Behavioral parity (exact):** math/learner numbers, save shape + storage keys, data formats,
  movement feel — verified by golden-value tests.
- **Experience parity (ported feel, Godot-native):** screen shake, damage flash, dopamine
  particles, dialog/menus are implemented with Godot tweens/GPUParticles2D/shaders rather than
  transliterating Phaser draw calls.
- Hosted learner sync defaults to local-only (the TS default); set the
  `crow_learner_api_base` persistence key to enable a backend.
- Web build is single-threaded for static-host/mobile compatibility.
- Still not ported (deliberate): `admin.html` learner dashboard; multi-threaded web export.
