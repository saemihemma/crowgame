# Hörmann — brand and art direction

Status: Supportive
Authority: Index for the brand artifacts in this folder. Brand law is in `BRAND_SYSTEM.md`; runtime truth is in `godot/**`.
Last verified against code: 2026-08-25

| File | What it owns |
| --- | --- |
| [BRAND_SYSTEM.md](./BRAND_SYSTEM.md) | **The canonical brand file.** Positioning, hero and enemy design law, voice, colour architecture, typography, the HUD and maths-board specs, motion grammar, the dopamine economy, audio, accessibility |
| [LEVEL_ART_BIBLE.md](./LEVEL_ART_BIBLE.md) | The five worlds — palettes, tilesets, props, objects, enemies, gimmicks, music and level-design notes |
| [ASSET_MANIFEST.md](./ASSET_MANIFEST.md) | The production list: every art asset still to generate, its exact pixel size, its destination path, and what to wire it into |

The world palettes themselves are data, not documents: they live in
`godot/data/themes/`, which is the only copy, and
[tools/verify_palettes.py](../tools/verify_palettes.py) gates them as part of
`npm run validate`.

If two documents disagree, `BRAND_SYSTEM.md` wins.

## Start here

- **Making a UI decision?** BRAND_SYSTEM §8 (interface) and §9 (motion).
- **Drawing something?** BRAND_SYSTEM §5 (pixel law, silhouette, outline) and
  the relevant world in the art bible.
- **Picking a colour?** BRAND_SYSTEM §6, then the world's token file. Do not
  invent a hex.
- **Wondering if something is on-brand?** BRAND_SYSTEM §13, five questions.

## Status of this work

**The five world themes are live.** The token files are copied into
`godot/data/themes/`, registered in `ThemeManager.THEME_KEYS`, and selected per level from
`level_registry.json`. The sky gradient, maths board, dialogue, HUD tint and FX
colours all come from the active world.

Still design-only: the HUD three-pod rebuild, the streak, the hero's scarf and
animation set, and every art asset in [ASSET_MANIFEST.md](./ASSET_MANIFEST.md).

Verify the live side:

```
npm run validate        # includes 65 colour-law checks on godot/data/themes
```

> **Note.** The screenshot walker (`themes:screenshots`) and the device audit
> drove the Phaser build through `window.__crowGame`, which no longer exists —
> both tools were deleted with it. The colour law below still runs, and is
> gated in CI. For a live look at the Godot build:
>
> ```
> bash godot/tools/build_web.sh
> (cd output/web && python3 -m http.server 8060)
> node tools/godot_play_smoke.mjs      # walks login -> menu -> level -> owl
> node godot/tools/web_boot_smoke.mjs  # iPad viewport, boots and renders
> ```

The measurable bar is BRAND_SYSTEM §14; the method for judging work against it
is §15. Open work itself lives in [../roadmap.md](../roadmap.md).

## Generating art

Read [ASSET_MANIFEST.md](./ASSET_MANIFEST.md), not the brand system. It carries
the pixel size, destination path, wiring target and verification loop for all 91
files, in priority order.
