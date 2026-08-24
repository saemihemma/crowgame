# Hörmann — brand and art direction

Status: Supportive
Authority: Index for the brand artifacts in this folder. Brand law is in `BRAND_SYSTEM.md`; runtime truth is in `src/**` and `public/data/**`.
Last verified against code: 2026-08-24

| File | What it owns |
| --- | --- |
| [BRAND_SYSTEM.md](./BRAND_SYSTEM.md) | **The canonical brand file.** Positioning, hero and enemy design law, voice, colour architecture, typography, the HUD and maths-board specs, motion grammar, the dopamine economy, audio, accessibility |
| [LEVEL_ART_BIBLE.md](./LEVEL_ART_BIBLE.md) | The five worlds — palettes, tilesets, props, objects, enemies, gimmicks, music and level-design notes |
| [ASSET_MANIFEST.md](./ASSET_MANIFEST.md) | The production list: every art asset still to generate, its exact pixel size, its destination path, and what to wire it into |
| [tokens/](./tokens/) | Five `ThemeDefinition` JSON files, one per world, plus `verify_palettes.py` |

If two documents disagree, `BRAND_SYSTEM.md` wins.

## Start here

- **Making a UI decision?** BRAND_SYSTEM §8 (interface) and §9 (motion).
- **Drawing something?** BRAND_SYSTEM §5 (pixel law, silhouette, outline) and
  the relevant world in the art bible.
- **Picking a colour?** BRAND_SYSTEM §6, then the world's token file. Do not
  invent a hex.
- **Wiring the themes up?** [tokens/README.md](./tokens/README.md).
- **Wondering if something is on-brand?** BRAND_SYSTEM §13, five questions.

## Status of this work

**The five world themes are live.** The token files are copied into
`public/data/themes/`, registered in `BootScene`, and selected per level from
`level_registry.json`. The sky gradient, maths board, dialogue, HUD tint and FX
colours all come from the active world.

Still design-only: the HUD three-pod rebuild, the streak, the hero's scarf and
animation set, and every art asset in [ASSET_MANIFEST.md](./ASSET_MANIFEST.md).

Verify the live side:

```
npm run dev                    # then, in a second shell:
npm run themes:screenshots     # 18 shots + palette conformance, all five worlds
cd brand/tokens && python3 verify_palettes.py
```

The prioritised implementation list is BRAND_SYSTEM §14.

## Generating art

Read [ASSET_MANIFEST.md](./ASSET_MANIFEST.md), not the brand system. It carries
the pixel size, destination path, wiring target and verification loop for all 91
files, in priority order.
