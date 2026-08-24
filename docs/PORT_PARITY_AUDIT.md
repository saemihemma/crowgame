# Port parity audit: what the retired Phaser tree still held

Status: Supportive
Authority: Evidence for one decision — that deleting `src/`, `public/`, `vite/`
and `admin.html` loses nothing. Not a description of the running system.
Last verified against code: 2026-08-24

## Why this exists

`src/`, `public/`, `vite/`, `admin.html` and `archived/` have been **deleted** from
the working tree (git history keeps them). This records where each of the 45
Phaser-only TypeScript files went, so the deletion was a checked action rather
than a hopeful one.

The 10 files that were **not** Phaser-only moved to `math-kernel/**` and are very
much alive — they generate the golden fixtures and drive the curriculum pipeline.
Those are not in this audit.

## Where each file went

Most of the port consolidated several small Phaser classes into one Godot node,
which is why a file-for-file mapping does not exist and should not.

| Phaser | Godot | Note |
| --- | --- | --- |
| `scenes/BootScene.ts` | `scripts/boot.gd` + autoloads | boot work split across `Config`, `DataManager`, `SceneRouter` |
| `scenes/LoginScene.ts` | `scripts/scenes/login.gd` | |
| `scenes/MainMenuScene.ts` | `scripts/scenes/main_menu.gd` | |
| `scenes/LevelSelectScene.ts` | `scripts/scenes/level_select.gd` | |
| `scenes/GameScene.ts` | `scripts/scenes/game.gd` | |
| `scenes/PauseScene.ts` | `scripts/scenes/pause.gd` | |
| `scenes/HUDScene.ts` | `scripts/ui/hud.gd` | a scene in Phaser, a CanvasLayer here |
| `scenes/MathChallengeScene.ts` + `ui/components/MathBoard.ts` | `scripts/ui/math_challenge.gd` | two files became one overlay |
| `ui/components/{CoinCounter,OwlCounter,HealthBar,AbilitySlots}.ts` | `scripts/ui/hud.gd` | four widgets folded into the HUD |
| `ui/components/FocusHighlight.ts` | `scripts/ui/ui_fx.gd` | `attach_focus_highlight()` |
| `ui/fx/DopamineFX.ts` | `scripts/ui/fx/dopamine_fx.gd` | GPUParticles2D rather than tween stacks |
| `ui/DialogBox.ts` | `scripts/entities/npc/dialog_component.gd` | moved to the NPC that owns it |
| `ui/TouchControls.ts` | `scripts/ui/touch_controls.gd` | |
| `ui/UINavigator.ts` | Godot focus system | engine feature; no port needed |
| `ui/theme/{ThemeManager,ThemeTypes}.ts` | `scripts/autoload/theme_manager.gd` + `data/themes/*.json` | types became data |
| `entities/Player.ts` | `scripts/entities/player.gd` + `player_motion.gd` | motion split out for the parity fixtures |
| `entities/Projectile.ts` | `scripts/entities/projectile.gd` | |
| `entities/enemies/{Enemy,Cockroach}.ts` | `scripts/entities/enemy.gd` | one data-driven enemy, per the spawn registry rule |
| `entities/npc/BaseNPC.ts` + `components/*` | `scripts/entities/npc.gd` + `npc/*_component.gd` | |
| `systems/NPCFactory.ts` | `data/registries/spawn_registry.json` | a factory became data — `ARCHITECTURE.md` rule 5 |
| `systems/{Save,Profile,Text,Level,Leveling,Audio}Manager.ts` | matching `scripts/autoload/*.gd` | |
| `systems/LearnerStateManager.ts` | `scripts/systems/learner_state_manager.gd` | parity-locked |
| `systems/ELOUpdateManager.ts` | `scripts/systems/elo_update_manager.gd` | |
| `systems/LearnerSyncService.ts` | `scripts/systems/learner_sync_service.gd` + `cloud_sync.gd` | local queue kept; transport replaced |
| `systems/InputManager.ts` | `project.godot` input map | engine feature |
| `gameplay/abilities/{Ability,AbilityManager}.ts` | `data/tuning/abilities.json` + player | |
| `gameplay/tuning/PlayerTuning.ts` | `data/tuning/player_base.json` | |
| `utils/Constants.ts` | `data/tuning/*.json` | the hardcode guard now forbids the old shape |
| `utils/EventBus.ts` | `scripts/autoload/event_bus.gd` | |
| `utils/applyGroundingVisualSink.ts` | sprite offsets in scenes | the 4px visual sink is baked into the scenes |
| `main.ts`, `vite-env.d.ts`, `vite/` | — | Vite bootstrap. No equivalent; Godot has its own entry. |
| `admin.html` | `scripts/ui/parent_report.gd` | see below |
| `public/data/**`, `public/assets/**` | `godot/data/**`, `godot/assets/**` | canonical copies moved |

## Two things deliberately not carried over

**`admin.html`'s translation editor.** Not ported, and not because it was hard: a
live string editor shipped to the public would let anyone on a shared family
device rewrite what a child reads. Translations live in
`godot/data/i18n/strings_*.json`, with CI enforcing EN/IS lockstep.

**The multi-threaded web export.** The single-threaded build serves from any
static host with no cross-origin isolation headers, which is what makes the
deployment as simple as it is.

Note that `admin.html` could not have been kept working anyway. It read browser
`localStorage`; the Godot build stores everything in
`user://crow_localstorage.json`, which is IndexedDB on the web. Same key names,
different storage engine — it could not see this game's data at all.

## What the port gained

Not parity, but worth recording as part of the same transition: cloud save across
devices, family auth, server-side error visibility, an in-engine parent report, an
Icelandic locale in lockstep with English, a CI-enforced no-hardcoding mandate,
and a browser harness that tests the exported build rather than the source.

## Verification, and one thing this audit got wrong

After deletion: `npm run validate`, `npm run typecheck`, `run_tests.sh` (65 tests
+ 6 probes), the 31 server tests and the browser boot smoke all pass.

But the pre-deletion version of this file claimed every gate already passed
"without those trees being read", and that was **wrong**. Deleting them exposed
ten tool files still reading the old paths:

- Eight built the path with `join(ROOT, 'public', 'data', ...)` rather than the
  string `"public/data"`, so the earlier repointing pass — which searched for the
  string form — missed all of them. `validate-content.ts` was reading
  `public/data/schemas/math-problem.schema.json` on every run.
- `process_audio.js` still wrote into `public/assets/`.
- `validate_docs.js` asserted the content of `archived/README.md`.

None of it was caught before, precisely because the files still existed. That is
the failure mode worth remembering from this audit: a check that passes because a
dead file is still on disk is not evidence, and grepping for one spelling of a
path is not a search. Deleting the tree was the only thing that could tell the
difference.

This file stays as history rather than being updated further.
