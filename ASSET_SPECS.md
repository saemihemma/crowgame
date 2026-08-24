# Asset Specifications

Status: Supportive
Authority: Live asset contract plus workflow guidance. Runtime truth still depends on BootScene, manifests, and registries.
Last verified against code: 2026-03-22

## Purpose

This document explains the live asset surface and the difference between runtime assets, staging assets, and archived material.

## Current Runtime Asset Contract

Boot-time asset loading in [src/scenes/BootScene.ts](./src/scenes/BootScene.ts) currently expects:

Sprites and images (tilesets now come from the manifest below, not from
hardcoded `BootScene` paths):
- `assets/sprites/characters/crow2/crow3/crow1-64px-fixed.png`
- `assets/sprites/characters/crow2/crow3/crow-walk-64px-fixed.png`
- `assets/sprites/characters/npcs/owl.png`
- `assets/sprites/characters/npcs/cockroach.png`
- `assets/sprites/ui/coin/coinsprite.png`
- `assets/sprites/objects/door/door-36.png`


Tilesets are no longer listed here. They are declared in the tileset manifest and
loaded from it.

Tileset manifest:
- [public/data/tilesets/tileset_manifest.json](./public/data/tilesets/tileset_manifest.json) is the live tileset manifest
- `BootScene` loads every entry it lists, via a nested load during `preload`, so
  a tileset needs no code to be added, replaced or removed
- the manifest `key` is both the Phaser texture key and the tileset name a
  compiled map carries; `GameScene.loadTiledLevel()` resolves the two by calling
  `map.addTilesetImage(name, name, ...)`, so they cannot drift apart
- geometry is fixed by `tools/level_compiler.ts`: a `128x128` sheet of `32x32`
  tiles, of which only indices 0, 1 and 2 are ever placed
- entries marked `"source": "generated"` come from `tools/gen_tilesets.mjs`;
  `node tools/gen_tilesets.mjs --check` fails if the manifest is stale
- replacing a generated tileset with real art: overwrite the PNG, copy it to
  `godot/assets/tilesets/`, and flip that entry to `"source": "authored"`
- full instructions and the per-world quality grades are in
  [brand/ASSET_MANIFEST.md](./brand/ASSET_MANIFEST.md)

Audio manifest:
- [public/data/audio/audio_manifest.json](./public/data/audio/audio_manifest.json) is the live audio manifest
- mutable manifest counts live only in the dated snapshot block in [ONBOARDING_AGENT.md](./ONBOARDING_AGENT.md) so current docs do not drift independently

Generated or companion runtime data consumed alongside assets:
- `public/data/levels/level_registry.json`
- `public/data/levels/compiled/*.json`
- `public/data/tuning/*.json`
- `public/data/themes/*.json`
- `public/data/i18n/strings_en.json`

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
- obvious backups and scratch artifacts should be moved there instead of being left under `public/assets/**`

## Current Notes

- the old runtime sprite manifest and sprite post-processing system have been archived
- optional helper tooling still exists in `tools/process_ai_assets.js` and via `npm run ai:extract` and `npm run ai:process`
- the current audio manifest is music-only, so SFX calls in code may degrade silently until live SFX entries are added

## Verification

When asset wiring changes:

```powershell
npm.cmd run validate
npm.cmd run validate:assets
npx.cmd tsc --noEmit
npm.cmd run dev
```

`validate:assets` verifies:
- the current audio manifest entries
- the tileset manifest entries
- BootScene visual assets extracted from source
- compiled level tileset image references
- suspicious unreferenced leftovers that should be archived instead of staying live

`npm.cmd run validate` already includes `validate:assets`. Use `npm.cmd run validate:assets` when you only want the asset subset during iteration.

Manual checks:
- confirm BootScene loads the asset without warnings
- confirm the asset is actually visible or audible in runtime
- confirm the path came from a live manifest or code reference, not an archived folder
