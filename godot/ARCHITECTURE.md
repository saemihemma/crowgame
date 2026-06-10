# Crow (Godot) — Architecture & Conventions

This project is **data-driven by mandate**: you change the game by editing JSON/data,
not by editing code. A CI guard (`tools/check_hardcoding.py`) enforces the rules below.

## The rules (enforced)
1. **No magic numbers in `.gd`.** Gameplay/UI/FX timings, sizes, and thresholds live in
   `data/tuning/*.json` and are read via the `Config` autoload:
   `Config.ui("touch/button_size")`, `Config.fx("shake/strength")`,
   `Config.get_value("camera_tuning", "followLerp")`.
2. **No user-facing strings in `.gd`.** Every player-visible string goes through
   `TextManager.t("key", [args])`. Keys live in `data/i18n/strings_en.json`; the Icelandic
   mirror `strings_is.json` must stay key-for-key in lockstep (CI test enforces it).
3. **No inline colors in `.gd`.** Styling colors come from the active theme:
   `ThemeManager.get_color_value("role")`. Add roles to `data/themes/theme_*.json`.
4. **No hardcoded scene paths.** Route via `SceneRouter.goto("main_menu")`
   (`data/registries/scenes.json`).
5. **No type→behavior switches for content.** New level objects come from
   `data/registries/spawn_registry.json` + a scene with `setup_from_spawn(spawn)`.
6. **No `play_sfx("key")` scattered in gameplay.** Fire semantic events:
   `AudioManager.play_event("coin")` (`data/audio/sound_events.json`).

Escape hatch for genuine exceptions (brand text, diagnostics): append `# hardcode-ok` to the line.

## The one boundary: Tier-1 parity constants stay in code
The ELO/learner/movement constants (`elo_manager.gd`, `learner_state_manager.gd`,
`player_motion.gd`, `MAX_RECENT_*`, K-tiers, clamps, gravity 800, review windows) are the
**verified 1:1 port of the TS source**, locked by golden-value tests
(`tests/test_math_parity.gd`, `test_motion_parity.gd`). They are deliberately NOT in tuning
JSON — moving them risks silent fidelity drift. Change them only with the TS source + the
golden fixtures (`npm run godot:gen-math-fixtures` / `gen-motion-fixtures`).

## How to add X (data-first recipes)
- **A sound:** add a WAV via `tools/gen_sfx.py` (or drop a file), add it to
  `data/audio/audio_manifest.json`, map an event in `data/audio/sound_events.json`, then
  `AudioManager.play_event("your_event")`.
- **A string / new language:** add the key to `strings_en.json` (+ `strings_is.json`); use
  `TextManager.t(key)`. New locale = add `strings_<code>.json`, register in `DataManager.PATHS`
  and `TextManager.LOCALE_FILES`.
- **A tuning value:** add it to the right `data/tuning/*.json`; read via `Config`.
- **A color/skin:** add a palette role to both `theme_*.json`; read via
  `ThemeManager.get_color_value(role)`. A whole new skin = a new theme JSON registered in
  ThemeManager.
- **A level:** author a `.tscn` in the Godot TileMap editor (or add compiled JSON +
  `level_registry.json`); object spawns use the spawn registry types.
- **A level object type (new enemy/pickup/NPC):** make a scene with `setup_from_spawn(spawn)`,
  add one entry to `spawn_registry.json`. No `game.gd` change.
- **A scene/route:** add it to `scenes.json`; navigate with `SceneRouter.goto(name)`.

## Layout
- `scripts/autoload/` — Config, DataManager, SceneRouter, EventBus, Persistence, Save/Profile/
  Text/Level/Leveling/Theme/Audio managers.
- `scripts/math/`, `scripts/systems/` — the learning engine (Tier-1) + LevelLoader + sync.
- `scripts/entities/`, `scripts/ui/`, `scripts/scenes/` — gameplay, HUD/menus, screens.
- `data/` — the source of truth: `tuning/`, `i18n/`, `themes/`, `registries/`, `audio/`,
  `levels/`, `math/`, `npcs/`, `enemies/`.
- `tests/` — headless suite (`tools/run_tests.sh`): unit suites + physics probes +
  hardcode guard. Green is the contract every change ships against (CI gates `main`).

## Verify before pushing
```bash
bash godot/tools/run_tests.sh      # guard + unit + probes (must be green)
bash godot/tools/build_web.sh      # refresh the mobile build
```
