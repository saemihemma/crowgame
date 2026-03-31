# Archive Index

Status: Historical
Authority: Archive policy only. Nothing here should be treated as current runtime truth.
Last verified against code: 2026-03-22

## Purpose

This folder preserves provenance without polluting the live repo surface.

Use `archived/**` for:
- superseded planning documents
- dead or not-yet-wired source files
- non-runtime asset copies
- staging material that should not look live anymore

## Rules

- do not edit archived material as part of normal feature work
- do not point runtime code or manifests at archived files
- if something must come back, restore it deliberately and update current docs in the same pass

## Current Archive Contents

- `archived/ai_assets_config.json`
  - archived AI-audio staging config from a non-live workflow
- `archived/docs/elo-math-system-plan.md`
  - historical math progression plan, superseded by current runtime
- `archived/src/**`
  - archived dead or unwired source files
- `archived/tools/**`
  - retired or non-runtime helper scripts kept only for provenance
- `archived/public/**`
  - non-runtime asset copies and unused data artifacts
- `archived/public/assets/level-copy-legacy/`
  - legacy copied level-door art, kept only for provenance
- `archived/public/assets/scratch-images/`
  - scratch or remove-background image experiments, not runtime assets
- `archived/public/assets/sprites/characters/npcs-copy-legacy/`
  - copied NPC sprite folders that are not wired into runtime
- `archived/public/assets/sprites/characters/crow2-experiments/`
  - archived crow source sheets, extracted frames, and unused movement experiments
- `archived/public/assets/sprites/ui/coin-experiments/`
  - archived coin concept renders and generated scratch variants
- `archived/public/assets/sprites/door-legacy/`
  - archived unused door sprite variants from pre-cleanup art passes
- `archived/public/assets/tilesets/level1-source/`
  - archived source tiles used by retired tileset-composition scripts, not live runtime assets
- `archived/public/assets/tilesets/level1-source-duplicate/`
  - duplicate live copy moved out during cleanup and preserved only for provenance
- `archived/public/assets/sprites/levels/level1/`
  - archived level art source slices that are not loaded by runtime
- `archived/public/assets/sprites/levels/level1-live-duplicate/`
  - duplicate live copy moved out during cleanup and preserved only for provenance
- `archived/sound/`
  - unreferenced local audio files
