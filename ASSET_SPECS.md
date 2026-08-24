# Asset Specifications

Status: Supportive
Authority: Live asset contract plus workflow guidance. Runtime truth still depends on BootScene, manifests, and registries.
Last verified against code: 2026-03-22

## Purpose

This document explains the live asset surface and the difference between runtime assets, staging assets, and archived material.

## Current Runtime Asset Contract

Boot-time asset loading in [godot/scripts/autoload/data_manager.gd](./godot/scripts/autoload/data_manager.gd) currently expects:

Sprites and images:
- `assets/sprites/characters/crow2/crow3/crow1-64px-fixed.png`
- `assets/sprites/characters/crow2/crow3/crow-walk-64px-fixed.png`
- `assets/sprites/characters/npcs/owl.png`
- `assets/sprites/characters/npcs/cockroach.png`
- `assets/sprites/ui/coin/coinsprite.png`
- `assets/sprites/objects/door/door-36.png`
- `assets/tilesets/forest_tiles.png`
- `assets/tilesets/level1_tiles.png`
- `assets/tilesets/spike_hazards.png`

Audio manifest:
- [godot/data/audio/audio_manifest.json](./godot/data/audio/audio_manifest.json) is the live audio manifest
- mutable manifest counts live only in the dated snapshot block in [ONBOARDING_AGENT.md](./ONBOARDING_AGENT.md) so current docs do not drift independently

Generated or companion runtime data consumed alongside assets:
- `godot/data/levels/level_registry.json`
- `godot/data/levels/compiled/*.json`
- `godot/data/tuning/*.json`
- `godot/data/themes/*.json`
- `godot/data/i18n/strings_en.json`

Asset work often fails because one of these companion data files still points at old paths or old keys.

## Live Rules

- a file is only live if runtime code, a registry, or a manifest references it
- compiled outputs are not asset sources of truth
- archived copy folders are never live references

## Staging And Archive Rules

Staging:
- `ai_assets/` is workflow staging only
- use it for raw audio holding, notes, or optional manual helper inputs, not runtime truth

Archived:
- `archived/**` contains historical plans, dead code, and non-runtime asset copies
- do not point runtime manifests at archived material
- obvious backups and scratch artifacts should be moved there instead of being left under `godot/assets/**`

## Current Notes

- the old runtime sprite manifest and sprite post-processing system have been archived
- optional helper tooling still exists in `tools/process_ai_assets.js` and via `npm run ai:extract` and `npm run ai:process`
- the current audio manifest is music-only, so SFX calls in code may degrade silently until live SFX entries are added

## Verification

When asset wiring changes:

```powershell
npm run validate
npm run validate:assets
npx tsc --noEmit
godot --path godot   # play it
```

`validate:assets` verifies:
- the current audio manifest entries
- BootScene visual assets extracted from source
- compiled level tileset image references
- suspicious unreferenced leftovers that should be archived instead of staying live

`npm run validate` already includes `validate:assets`. Use `npm run validate:assets` when you only want the asset subset during iteration.

Manual checks:
- confirm BootScene loads the asset without warnings
- confirm the asset is actually visible or audible in runtime
- confirm the path came from a live manifest or code reference, not an archived folder
