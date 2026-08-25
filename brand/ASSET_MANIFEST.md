# Hörmann — Art Asset Manifest

Status: Supportive
Authority: The list of art assets still to generate, with their sizes and destinations. Runtime truth is the Godot project under `godot/` - its registries, theme files and tuning JSON.
Last verified against code: 2026-08-24

Every art asset the five worlds need, in the order worth making them, with the
exact pixel dimensions and the exact path each file goes to. Design intent lives
in [BRAND_SYSTEM.md](./BRAND_SYSTEM.md) and [LEVEL_ART_BIBLE.md](./LEVEL_ART_BIBLE.md);
this file is the production list.

---

## The pixel law, in one table

Non-negotiable, from BRAND_SYSTEM §5.1. Everything below obeys it.

| Thing | Size | Why |
| --- | --- | --- |
| Canvas | `960x540`, integer 2x to 1080p | `display/window/size/viewport_width`/`_height` in `godot/project.godot` |
| Tiles | `32x32` | `TILE_SIZE` |
| Characters, enemies, NPCs, props | `64x64` per frame | `SPRITE_SIZE`; matches the shipped crow, owl and cockroach |
| Doors | `88x96` | matches the shipped `door-36-runtime-88x96.png` |
| Coins | `32x32` per frame | matches the shipped `coinsprite-runtime-32.png` |
| HUD icons | `32x32` or `16x16` | nothing between |
| Parallax strips | `960` wide, tileable on x | one screen wide, repeated |

Rules that apply to every file in this document:

- **PNG, RGBA, transparent background.** No baked background colour.
- **No anti-aliasing.** Hard pixel edges only. If the generator softened the
  edges, the asset is not usable - re-do it, do not try to sharpen it after.
- **1px outline in the world's `ink_world`** on anything in the play layer.
  No outline at all on sky, far or mid layers. This is what separates
  "you can touch this" from "this is scenery".
- **Sprite sheets are a single horizontal strip**, frames left to right, no
  padding, no margin. `frameWidth`/`frameHeight` in the registry must match
  exactly. This is how every shipped sheet is already laid out.
- **Author at 1x.** Never generate at 4x and downscale; it produces the muddy
  edges `PROJECT.md` explicitly warns against.

---

## How to generate and place an asset

The repo has no automated art pipeline and `ai_generation_guide.md` is explicit
that the helper scripts are manual conveniences, not a production path. The loop
that actually works:

1. **Generate externally**, at the exact dimensions in the tables below, using
   the world's palette hexes in the prompt (they are listed per world).
2. **Stage it** in `ai_assets/` if you want to iterate. Nothing there is live.
3. **Check it against the pixel law** above. Reject soft edges now, not later.
4. **Place the approved file** at the exact `Destination` path in the table.
5. **Wire it** - the `Wire in` column names the file to edit. An asset that
   nothing references is not live, and `npm run validate:assets` will flag it
   as a suspicious unreferenced leftover.
6. **Verify**:

```
npm run validate          # content, docs, assets, i18n
npx tsc --noEmit
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

The screenshot walker used to be the gate that mattered for art: it walked all
six levels, captured gameplay and the maths board in each, and checked the
rendered pixels against that world's token file. It drove the Phaser build and
went with it. **Nothing currently checks a new asset's palette against its
world**, which is a real gap — `brand/tokens/verify_palettes.py` proves the
token files are internally lawful, not that the shipped pixels match them.
Rebuilding it against the Godot export is the honest replacement.

---

## Priority 0 - the five tilesets — **DONE, as placeholders**

Five generated tilesets ship at `godot/assets/tilesets/<world>_tiles.png`, each
level points at its own, and no two levels share a ground any more. They are
**art-directed placeholders, not finished art** - see the honest grades at the
bottom of this section. Replacing them is the highest-value art work available.

### The real geometry contract

An earlier version of this document specified a `320x320` sheet with a 9-tile
order. **That was wrong.** The truth, read out of the compiled level JSON and `scripts/levels/level_loader.gd`:

| | |
| --- | --- |
| Sheet | **`128x128`** - 4 columns x 4 rows, 16 tiles of `32x32` |
| `firstgid` | 1, so map GID *n* renders tile index *n - 1* |
| Index **0** | ground surface - the top row of a `ground` platform |
| Index **1** | ground fill - every row below a ground platform |
| Index **2** | floating platform - a whole `platform`, one tile tall |
| Index 3-15 | **never placed.** Reserved |

**Only three tiles are ever used.** Drawing more is wasted effort until the
compiler learns to place them; it emits an empty `decoration` layer today and
never populates it (tracked in `roadmap.md`).

Three constraints that follow from this, and they are not stylistic:

- **Index 0 and 2 must tile seamlessly on x**; index 1 must tile on **both**
  axes. A ground run is one tile repeated across the whole screen.
- **Index 2 must be opaque for its full 32px.** Tilemap collision is per-tile,
  so art thinner than the tile leaves invisible collision above the visible ledge.
- **Texture must be non-figurative on organic materials.** With one tile per
  role, any recognisable mark becomes wallpaper. Generated passes that put
  pebbles, branching crystal seams and stone cracks into the field produced,
  respectively, a printed lattice, small repeating stick figures, and what read
  as a scattered typeface. Machined materials - a boardwalk, a riveted plate -
  are the exception: they are supposed to repeat, so an aligned grid reads as
  architecture. Distinctive one-off marks belong in decoration tiles.

### Replacing one

The PNG is the asset. Nothing about a tileset lives in code.

1. Draw `128x128` with tiles 0, 1 and 2 in the order above.
2. Save over `godot/assets/tilesets/<world>_tiles.png`, and copy to
   `godot/assets/tilesets/`.
3. Set `"source": "authored"` for that entry in
   `godot/data/tilesets/tileset_manifest.json`, so the generator stops being
   treated as its origin.
4. `npm run validate`, then look at the build: `bash godot/tools/build_web.sh`
   and `node tools/godot_play_smoke.mjs`.

To **add** a world: drop a PNG in, add a manifest entry, add a theme token file,
give a level spec that `theme`. The tileset manifest is loaded by `DataManager`, so there
is still no code change.

The generator that made the current placeholders is `tools/gen_tilesets.mjs`
(`node tools/gen_tilesets.mjs`, or `--check` to verify the manifest is current).
It writes both runtimes. Deleting it once real art lands costs nothing.

### Honest grades

Judged in-game at 1x, not on a magnified contact sheet:

| World | Grade | What is still wrong |
| --- | --- | --- |
| Emberwood | 6.5 / 10 | Best of the five and genuinely playable. Grass reads, soil has depth. Grass green is minty against a warm dawn; soil is busier than it should be at depth |
| Sugarstorm | 6 / 10 | Reads as a boardwalk on a braced frame. Plank band is thin, X-bracing is too low-contrast at 1x, and the platform is the same material as the ground so the two do not separate |
| Geyserworks | 6 / 10 | Plate, seam and rivets read as industrial. Fill is near-black, so deep ground is a void; the top band is flat enough to read as concrete rather than metal |
| Prism Hollow | 5.5 / 10 | Basalt with a bright cyan platform lip. Facet blobs still cluster into a faint recurring motif; the handoff from lit band to dark body is abrupt |
| Aurora Spire | 5.5 / 10 | Turf edge is the best single detail in the set. The stone is washed out and foggy, and its value range is the narrowest of the five |

**None of these is finished art.** Procedural generation is the right tool for
proving the geometry contract, giving each world a distinct value structure and
hue, and unblocking the game - and the wrong tool for finished pixel art. A
competent tile artist beats every one of these in an afternoon. What they will
not have to do is guess at the contract, the seams, or the palette.

## Priority 1 - parallax

The sky is now a two-stop gradient from the theme, which is why the worlds
already read as different places. The far and mid layers are what give them
depth and scale. Scroll factors are fixed by BRAND_SYSTEM §5.4 and already
recorded in each token file under `world.parallax`.

| Layer | Size | Scroll | Saturation | Notes |
| --- | --- | --- | --- | --- |
| `far` | `960x180`, tileable on x | 0.25 | 40% | horizon silhouette strip, single flat colour, no outline |
| `mid` | `960x260`, tileable on x | 0.55 | 70% | structures and big flora, 2-3 tone, no outline |
| `near` | `960x120`, tileable on x | 1.35 | 60% | foreground framing, max 15% screen coverage |

- **Emberwood:** `godot/assets/parallax/emberwood_far.png`, `emberwood_mid.png`, `emberwood_near.png` - far `#6E9E8A`, mid `#2E6B47`, near `#194031`
- **Prism Hollow:** `godot/assets/parallax/prism_hollow_far.png`, `prism_hollow_mid.png`, `prism_hollow_near.png` - far `#241D52`, mid `#37306E`, near `#0E0B26`
- **Sugarstorm:** `godot/assets/parallax/sugarstorm_far.png`, `sugarstorm_mid.png`, `sugarstorm_near.png` - far `#6B2A8A`, mid `#A83CA0`, near `#1B0F3B`
- **Geyserworks:** `godot/assets/parallax/geyserworks_far.png`, `geyserworks_mid.png`, `geyserworks_near.png` - far `#3A3B44`, mid `#5A4238`, near `#20161A`
- **Aurora Spire:** `godot/assets/parallax/aurora_spire_far.png`, `aurora_spire_mid.png`, `aurora_spire_near.png` - far `#1E2A55`, mid `#2F4E7A`, near `#0B1030`

**Wire in:** a new `_paint_parallax()` in `godot/scripts/scenes/game.gd`, beside
the existing `_paint_sky()`, on `ParallaxBackground` layers under the sky's
`CanvasLayer`. The `far`, `mid` and `deep` palette roles already exist in every
theme file and nothing reads them yet - the sky gradient uses only `sky_top` and
`sky_bottom`.

---

## Priority 2 - the four new enemies

One Muddle species per world. `cockroach_basic` already covers Emberwood and
only needs a retint. Adding an enemy is a registry entry plus one sheet -
`NPCFactory` and `Enemy` already read `enemy_registry.json`, so no code changes.

| World | Registry id | Sheet | Size | Frames | Silhouette |
| --- | --- | --- | --- | --- | --- |
| Emberwood | `cockroach_basic` | *retint existing to* `#9AB03C` | `64x64` | as shipped | low, wide, five legs |
| Prism Hollow | `shardling_basic` | `shardling.png` | `64x64` | 4 walk + 2 idle | angular, hunched, one glowing facet |
| Sugarstorm | `gumsnap_bouncer` | `gumsnap.png` | `64x64` | 4 bounce + 2 idle | round, wobbly, top-heavy, paper crown |
| Geyserworks | `slagjaw_armored` | `slagjaw.png` | `64x64` | 4 walk + 2 vent | boxy, spiked shoulders, one huge claw |
| Aurora Spire | `gloomgull_drifter` | `gloomgull.png` | `64x64` | 4 drift + 2 idle | tall, thin, three torn wings |

- **Destination:** `godot/assets/sprites/characters/enemies/<name>.png`
- **Wire in:** `godot/data/enemies/enemy_registry.json`, and the `enemies` array
  of the level spec that uses it
- **The ugly law applies** (BRAND_SYSTEM §3.1): asymmetric, lumpy, odd number of
  visible legs, one thing snaggled. **Yellow mismatched oversized eyes, never
  red, never glowing.** No teeth on anything friendly, no gore on anything.

---

## Priority 3 - the loop objects

The things a child touches every few seconds. These carry world identity harder
than scenery does, because the player is looking straight at them.

| Object | Size | Frames | Destination | Wire in |
| --- | --- | --- | --- | --- |
| Coin skin x5 | `32x32` | 3x3 spin sheet | `godot/assets/sprites/ui/coin/<world>_coin.png` | `Coin.tscn`, and frame 0 in the HUD chip |
| Door x5 | `88x96` | 6 open | `godot/assets/sprites/objects/door/<world>_door.png` | `theme.door.sprite` |
| Owl station x5 | `64x64` | 2 idle | `godot/assets/sprites/objects/owl_station/<world>.png` | level spec props |
| Chain link x5 | `32x32` | 1 idle + 4 burst | `godot/assets/sprites/objects/chain/<world>_link.png` | `behaviorConfig.chainLinks` |
| Hazard x4 | `32x32` | 4 idle loop | `godot/assets/tilesets/<world>_hazards.png` | level spec `hazards` |

Hazards are **two-tone**: a dark base in `hazard_base` and a bright tip in
`hazard`. That is not styling - BRAND_SYSTEM §6.5 requires the pair to clear
3:1 luminance against both ground values, and no single colour can. Sugarstorm
ships no hazard by design.

| World | `hazard` tip | `hazard_base` | Object |
| --- | --- | --- | --- |
| Emberwood | `#FF8A5C` | `#3A0F08` | Thornbramble |
| Prism Hollow | `#FF7A00` | `#0A0818` | Shardspike |
| Sugarstorm | `#FF3B6B` | `#3A0620` | *none by design* |
| Geyserworks | `#FF3B0F` | `#160F12` | Steam vent + slag pool |
| Aurora Spire | `#FF6B8A` | `#4A1030` | Wind shear band |

Chain links are drawn across the owl's perch, one per remaining answer, and burst
in the world's `enemy_pop` colour as each is broken. The count comes from the
registry, so a three-link owl reads as *more* before a child commits to it. See
BRAND_SYSTEM §3.4a.

Coins keep the shipped `32x32` silhouette and the gold `#FFC93C` in every world -
only the material treatment changes. A child must never have to re-learn what a
coin looks like. Same for the owl.

---

## Priority 4 - themed UI sprites

Every one of these has a **live slot in the Godot build**: the code looks for the
file at the path below, uses it if it is there, and draws a themed fallback if it
is not. So each is a drop-in - copy the file to the path, run the game, see it.
No wiring, no code change, no registry entry.

That is the whole architecture: *nothing here is drawn in code because we want it
to be.* The fallbacks exist so the game is playable and reviewable before the art
lands, and every one of them is a placeholder with a file path waiting for it.

### Live slots - drop a file in and it appears

| File | Size | Falls back to | Drawn by |
| --- | --- | --- | --- |
| `godot/assets/sprites/ui/hud/owl-icon-32.png` | `32x32` | a head crop of the 64px world owl | `scripts/ui/components/owl_ring.gd` |
| `godot/assets/sprites/ui/board/count-token-32.png` | `32x32` | a themed disc with an ink rim | `scripts/ui/components/count_row.gd` |
| `godot/assets/sprites/ui/board/board-9slice.png` | nine-slice, `96x96` source | a rounded `boardBg`/`boardBorder` panel | `scripts/ui/math_challenge.gd` |

Notes on each:

- **Owl icon.** Sits in the HUD ring at `32x32` and again on the maths board
  header at `34`. It has one job - say "owl" in a glance - so it wants a head,
  not the full body. The fallback crops the world sprite's head for exactly this
  reason; the full owl in chains holding a padlock collapses into noise at this
  size.
- **Count token.** The thing a child counts. Drawn at `32x32`, 1:1 with the
  source, so it must not be resampled. It must **not** look like a coin: coins
  mean currency everywhere else in the game, and a row of them on the board reads
  as a reward rather than a question. Ten per row in a ten-frame with a gap after
  the fifth, so whatever it is has to stay countable at a glance in a run of
  nineteen.
- **Board nine-slice.** The board measures its content and grows - a counting
  problem with nineteen tokens is roughly twice the height of `3 + 2` - so a
  fixed-size frame would stretch and smear its corners. Ship a nine-slice source
  and set its border inset in `ui_tuning.json` under
  `math_challenge.board_texture_inset` (default `24`). The path itself is also
  configurable there as `math_challenge.board_texture`, so a per-world board is a
  data change, not a code change.

**The board nine-slice no longer needs a code change first.** That caveat was
written against the Phaser `MathBoard`, which drew a rounded rect with `Graphics`
and had no texture path at all. The Godot board takes a `StyleBoxTexture` the
moment the file exists.

### Still code-drawn, and fine that way

These are drawn from theme colours and want no texture. They are geometry, not
illustration, and a bitmap would only make them worse at other resolutions:

| What | Where |
| --- | --- |
| Heart row | `scripts/ui/components/heart_row.gd` |
| Coin chip pill | `scripts/ui/components/coin_chip.gd` |
| Owl ring track, bezel and streak flame | `scripts/ui/components/owl_ring.gd` |
| Answer button faces | `scripts/ui/components/answer_button.gd` |
| Sky gradient | `scripts/scenes/game.gd` |

The coin **icon** inside the chip is the existing
`assets/sprites/ui/coin/coinsprite-runtime-32.png`, frame 0 of its 3x3 spin
sheet. Replacing that sheet re-skins the HUD coin and the world coin together,
which is correct - they are the same object.

### Not yet slotted

Touch controls and the dialogue frame have no Godot slot yet, because the touch
layout is being redesigned in Phase 1 and drawing art against the current one
would be wasted work. They return to this table once that lands.

---

## Priority 5 - the hero

Two sheets ship today: `crow1-64px-fixed.png` and `crow-walk-64px-fixed.png`.
The character reads correctly already - scrappy, a bit punk, not cute. **Do not
restyle him.** What is missing is the animation set and the scarf.

| Animation | Frames | Size | FPS |
| --- | --- | --- | --- |
| `idle` | 4 | `256x64` | 6 |
| `idle_long` | 6 | `384x64` | 6 |
| `run` | 8 | `512x64` | 14 |
| `jump` | 3 | `192x64` | - |
| `fall` | 2 | `128x64` | 10 |
| `peck` | 5 | `320x64` | 18 |
| `hurt` | 2 | `128x64` | 8 |
| `celebrate` | 6 | `384x64` | 10 |

- **Destination:** `godot/assets/sprites/characters/crow2/crow3/crow-<anim>-64.png`
- **Wire in:** the crow's `AnimatedSprite2D` frames in `godot/scenes/Player.tscn`
- **The scarf** (`hero` `#E23B3B`) is drawn into every frame, 20-28px trailing.
  It is the single highest-value addition in the brand system: it gives him a
  logo, free secondary motion, readability against all five worlds, and a state
  channel. BRAND_SYSTEM §2.3 has the per-state behaviour table.
- **Squash and stretch is code, not frames.** `land` and `jump` deformations are
  tweens on the sprite (§9.2). Do not draw them.

---

## What is already done and needs no art

Worth stating, so nobody generates something that is already handled:

| Already themed from JSON | Where |
| --- | --- |
| Sky gradient, per world | `GameScene.paintSkyGradient()` |
| Maths board fill, border, buttons, text | `math_challenge.gd` and `answer_button.gd`, drawn from theme roles |
| Dialogue colours and name colour | `DialogBox` |
| HUD hearts, coin pill, owl ring | `heart_row.gd`, `coin_chip.gd`, `owl_ring.gd` |
| Scrim, dust, laser, muzzle, enemy-pop FX colours | `DopamineFX` via the palette |
| Hazard, ground and parallax colour values | the five token files |

---

## Total

| Priority | Files | What it buys |
| --- | --- | --- |
| ~~P0 tilesets~~ | ~~5~~ | **done as placeholders** - five worlds no longer share one ground. Redrawing them by hand is still the highest-value art job on the list |
| P1 parallax | 15 | depth and scale |
| P2 enemies | 4 new + 1 retint | escalation becomes visible |
| P3 loop objects | 19 | the moment-to-moment loop gets world identity |
| P4 themed UI | 45 | replaces placeholders; safe one at a time |
| P5 hero | 8 | the animation set and the scarf |

**91 files, of which 5 are placed and 86 remain.** Nothing in P1-P5 blocks
anything else, so they can land in any order, one file per pull request. The
palette gate that used to police them is gone (see above); until it is rebuilt,
`node tools/godot_play_smoke.mjs` and a human eye are the check.
