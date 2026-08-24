# Hörmann — brand and art direction

Status: Supportive
Authority: Index for the brand artifacts in this folder. Brand law is in `BRAND_SYSTEM.md`; runtime truth is in `src/**` and `public/data/**`.
Last verified against code: 2026-08-24

| File | What it owns |
| --- | --- |
| [BRAND_SYSTEM.md](./BRAND_SYSTEM.md) | **The canonical brand file.** Positioning, hero and enemy design law, voice, colour architecture, typography, the HUD and maths-board specs, motion grammar, the dopamine economy, audio, accessibility |
| [LEVEL_ART_BIBLE.md](./LEVEL_ART_BIBLE.md) | The five worlds — palettes, tilesets, props, objects, enemies, gimmicks, music and level-design notes |
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

These are **design artifacts, not runtime truth**. Nothing here is wired into
the game yet. The token files are staged rather than dropped into
`public/data/themes/` because `ASSET_SPECS.md` holds that a file under
`public/**` is only live if runtime code, a registry or a manifest references
it — see [tokens/README.md](./tokens/README.md) for the four-step wiring recipe
and why it is safe to land before any new art exists.

The prioritised implementation list is BRAND_SYSTEM §14.
