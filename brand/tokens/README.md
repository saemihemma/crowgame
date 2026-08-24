# Theme tokens

Status: Supportive
Authority: Authoring source for the five world palettes. Runtime truth is whatever `BootScene` actually registers.
Last verified against code: 2026-08-24

Five `ThemeDefinition` files, one per world, in the exact shape
`src/ui/theme/ThemeTypes.ts` expects. Colour law is in
[../BRAND_SYSTEM.md](../BRAND_SYSTEM.md) §6; per-world art detail is in
[../LEVEL_ART_BIBLE.md](../LEVEL_ART_BIBLE.md).

| File | World | Level |
| --- | --- | --- |
| `theme_emberwood.json` | Emberwood | `level_01` |
| `theme_prism_hollow.json` | Prism Hollow | `level_02` |
| `theme_sugarstorm.json` | Sugarstorm | `level_03` |
| `theme_geyserworks.json` | Geyserworks | `level_04` |
| `theme_aurora_spire.json` | Aurora Spire | `level_05` |

## Why these live here and not in `public/data/themes/`

`ASSET_SPECS.md` is explicit that a file under `public/**` is only live if
runtime code, a registry or a manifest references it. These are not referenced
yet, so putting them there would make `public/data/themes/` lie about what is
live. They stay staged until the wiring below lands, and then they move.

## Wiring recipe

Four steps. None of them needs any new art to exist first.

1. Copy the five files into `public/data/themes/`.
2. Add each to `DATA_PATHS` in `src/utils/Constants.ts`.
3. Load and register them in `BootScene` — `this.load.json(...)` in `preload`,
   `tm.registerTheme(...)` in `registerThemes()`.
4. In `GameScene`, call `ThemeManager.getInstance().setTheme(spec.theme)` when a
   level loads, instead of leaving `forest` active from boot.

## Why this is safe before the art exists

Every sprite key in these files (`ui_emberwood_heart`, `door_sugarstorm`, …) is
aspirational. That is already true of the two shipped themes —
`ui_forest_board_frame` has never had a texture behind it. The consumers handle
it:

- `HealthBar.buildIcons()` checks `this.scene.textures.exists(iconKey)` and
  falls back to a generated placeholder tinted from the palette.
- `MathBoard.drawBoardBackground()` draws with `Graphics` from `boardBg` /
  `boardBorder` and never touches `frameSprite`.

So step 1–4 alone produce five visibly different worlds — board, buttons, HUD
tint, dialogue, scrim and FX colour all change — from JSON, with no art
pipeline. Sprites replace the placeholders later, one world at a time.

## Structure

| Block | Notes |
| --- | --- |
| `palette` (first 10 keys) | the `ThemePalette` interface contract — do not reorder or drop |
| `palette` (Fixed Nine) | `ink` `paper` `coin` `owl` `yes` `notyet` `hurt` `hero` `focus`. **Byte-identical in all five files.** A diff that shows one of these changing is a bug |
| `palette` (world vars) | `ink_world` `sky_*` `far` `mid` `deep` `ground_lit` `ground_shadow` `light` `hazard` `hazard_base` `enemy_pop` |
| `palette` (legacy keys) | `scrim`, `dust`, `spike`, `laser`, `muzzle`, `touch_*` — carried from the shipped themes so the Godot port keeps parsing, retuned off the Fixed Nine |
| `hud` `mathBoard` `controls` `door` `dialog` | the existing `ThemeDefinition` sections, unchanged in shape |
| `world` | **new, additive.** Level binding, material name, tileset path, parallax scroll factors and layer colours. Ignored by the current `ThemeManager`; add to `ThemeTypes.ts` when the parallax layers get built |

Two deliberate changes from the shipped themes:

- **`wrongFx` is `shake_amber`, not `shake_red`.** Red is reserved for physical
  damage. See BRAND_SYSTEM §6.2.
- **`scrim` is `#1A1420b8`, not `#0000009e`.** Warm near-black at 72%. Pure
  black behind warm pixel art reads as a hole in the screen. See §8.7.

Three keys are new and additive — `ground_lit`, `ground_shadow` and
`hazard_base`. They exist because the contrast rules cannot be checked without
them: a hazard has to be measured against the tiles it actually sits on, and no
single hazard colour clears both a lit and a shadowed ground. See §6.5.

## Verification

```
cd brand/tokens && python3 verify_palettes.py
```

65 checks across the five files: the Fixed Nine are byte-identical everywhere,
text clears 4.5:1 on every surface, `yes` and `notyet` separate on luminance,
every two-tone hazard pair clears 3:1 against both ground values, hazards and
amber never collide with coin gold, and no scrim is pure black. Exits non-zero
on any violation.

Two of those rules were added because the first draft of these tokens failed
them — bright amber `#FFB347` was indistinguishable from `yes` green under
deuteranopia, and three of the five hazards vanished against their own ground.
Run it after any palette edit. Wire it into `npm run validate` when the tokens
move into `public/data/themes/`.
