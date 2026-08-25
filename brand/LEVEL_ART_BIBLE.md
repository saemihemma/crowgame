# Hörmann — Level Art Bible

Status: Supportive
Authority: Per-world art direction. Brand law lives in `brand/BRAND_SYSTEM.md`; runtime truth lives in `godot/**`.
Last verified against code: 2026-08-25

Five worlds. Companion to [BRAND_SYSTEM.md](./BRAND_SYSTEM.md), which owns
everything that does **not** change per world. Tokens in `godot/data/themes/`.

---

## The ladder

When this was written all six level specs declared `"theme": "forest"` and every registry entry
loads the same `level1_tiles.png`. Five levels, one look. The ladder below fixes
that, and it is sequenced so that **each world contradicts the one before it** —
if two adjacent worlds share a hue story or an emotional register, one of them
is wasted.

| # | Level | World | Emotional beat | Hue | Light | Threat | Density |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `level_01` | **EMBERWOOD** | waking up | warm green | golden dawn | low | medium |
| 2 | `level_02` | **PRISM HOLLOW** | holding your breath | violet + cyan | emissive dark | medium | high |
| 3 | `level_03` | **SUGARSTORM** | showing off | hot pink + teal | neon night | **none** | very high |
| 4 | `level_04` | **GEYSERWORKS** | pushing through | rust + orange | molten | **high** | medium |
| 5 | `level_05` | **AURORA SPIRE** | arriving | indigo + aurora | cold clean | medium | low |

Three deliberate structural choices:

- **World 3 has no enemies.** After the cave, Sugarstorm is a pure reward world
   — the breather. It is also the densest, brightest, loudest place in the game.
  This is Casino Night placed where Green Hill's second act would be, and it is
  the classic platformer pacing move: contrast, not monotonic escalation. It
  also happens to fit `level_03`'s existing spec, which has zero enemies and
  zero hazards.
- **World 4 is the only genuinely dangerous one.** Coming straight off the
  safest world, Geyserworks lands hard.
- **World 5 gets quieter, not louder.** The finale is *arrival*, not *maximum
  intensity*. Emptying the screen at the summit is what makes the summit feel
  like a summit.

**Schema note.** `level-spec.schema.json` enums `theme` to
`["forest","cave","village","mountain","sky","underwater"]` — since replaced with the five world ids. Replace that list
with the five world ids below so a level spec's `theme`, a `ThemeManager` id and
a token filename are the same word. Until then the safe mapping is
forest / cave / village / mountain / sky in ladder order.

---

## What every world must supply

The checklist. A world is not finished until all of it exists.

| Slot | Requirement |
| --- | --- |
| **Sky** | 2-stop gradient + one celestial or focal element |
| **Far layer** | horizon silhouette strip, 0.25 scroll, 40% saturation |
| **Mid layer** | 3 structure sprites, 0.55 scroll, 70% saturation |
| **Tileset** | 32px: ground top, ground fill, edge L/R, platform L/M/R, inner corner, decorative wall — 9 tiles minimum |
| **Hazard** | one 32px hazard, jagged silhouette, 0.8s idle loop |
| **Enemy** | one 64px Muddle species, 4-frame walk + 2-frame idle |
| **Owl station** | the world's "stuck owl" prop, 64px |
| **Door** | 88×96 exit door in world material, 6-frame open |
| **Coin skin** | the world's take on the coin — **shape and gold `#FFC93C` never change**, only the material treatment |
| **Particles** | 2 ambient types on `mid`, 1 gameplay type on `play` |
| **Board frame** | the maths board in world material, same 520×280 geometry |
| **Signature** | one traversal gimmick unique to this world |
| **Music** | the shared 8-bar motif in this world's arrangement |

---

# 1 · EMBERWOOD
### `level_01` · *Forest Clearing* → **Emberwood Run**

> Dawn is two minutes old. The forest is still cold, the light is coming in flat
> and gold through the trunks, and everything is about to start moving.

The tutorial world, so it must be the most beautiful one — this is the screenshot
that decides whether a parent installs it. Green Hill energy: warm, generous,
open, fast, entirely non-threatening.

**Why not the current "forest clearing":** the existing `forest_tiles.png` is
flat mid-day green grass over brown dirt. Mid-day is the least interesting light
there is. Dawn gives long shadows, warm rim-light on every trunk, and a peach-to-
cyan sky that no other world in the ladder can use.

### Palette

| Token | Hex | |
| --- | --- | --- |
| `sky_top` | `#FFB98A` | peach dawn |
| `sky_bottom` | `#7ED0E8` | cold morning cyan at the horizon |
| `far` | `#6E9E8A` | misted tree silhouettes |
| `mid` | `#2E6B47` | mid canopy |
| `primary` | `#3F8F5B` | leaf green — the world's identity colour |
| `secondary` | `#8A5A2B` | bark |
| `deep` | `#194031` | shadow under the canopy |
| `ground_lit` | `#5FB574` | lit grass row |
| `ground_shadow` | `#6B4A2E` | dirt / shadowed ground |
| `accent` | `#FFC93C` | gold — dawn light and coins agree here |
| `light` | `#FFD98A` | god-rays |
| `hazard` | `#FF8A5C` | thorn tip |
| `hazard_base` | `#3A0F08` | thorn body — the dark half of the two-tone pair |
| `enemy_pop` | `#9AB03C` | olive |
| `ink_world` | `#1F1A16` | warm brown-black outline |

### Environment

- **Sky:** peach → cyan vertical gradient. A low sun disc at 15% screen height,
  right of centre, `#FFF2CC`, no outline.
- **Far:** flat conifer-silhouette strip in `#6E9E8A`, three depth-repeats.
- **Mid:** three trunk sprites (thin / thick / forked) with lichen patches,
  hanging vines, and one fallen log arch the player passes *through*.
- **Near:** out-of-focus fern fronds bottom-left and bottom-right, 12% coverage.
- **God-rays:** 4 additive diagonal bands at 0.12 alpha, drifting horizontally
  on a 12s loop. This one effect does more for the world than any sprite in it.

### Tileset

Grass-topped earth. **Two grass rows, not one** — a bright `#5FB574` lit row and
a `#3F8F5B` shadow row beneath it, which is what gives dawn its direction. Dirt
fill in `#6B4A2E` with three scattered pebble variants. Platform edges finish in
a curled root. Exposed dirt sides get **hanging grass tufts**, 8px, that sway on
a 3s loop.

### Props

Ferns · toadstool clusters (three sizes) · mossy boulders · a mushroom ring
around each owl station · fallen branches · dew-strung spiderwebs in the
corners · tree stumps with visible rings

### Objects

| Object | Look | Behaviour |
| --- | --- | --- |
| **Coin** | gold acorn, glinting facet | bobs 4px, 1.6s, phase-offset |
| **Hazard** | **Thornbramble** — dark knotted body `#3A0F08` with hot coral tips `#FF8A5C` | 0.8s breathing loop; replaces the current generic grey `spike_hazards.png`. The two-tone split is required, not decorative: the dark body carries the read on lit grass, the bright tips carry it on dirt |
| **Enemy** | **Grubbin** — the existing cockroach, retinted olive `#9AB03C`, one antenna bent | patrols, turns at ledges |
| **Owl station** | owl sat in a hollow knot, halfway up a trunk, mushroom ring below | needs one platform hop to reach |
| **Door** | two saplings arched and woven, leaves closed across the gap | leaves unfurl outward, 6 frames |
| **Board frame** | bark plank framed in living vine, corner knots | vines curl in on entry |

### Signature gimmick — **Leaf spouts**

Columns of upward-drifting leaves that carry Hörmann up two platform tiers.
Visible as a persistent swirl of `#5FB574` leaves. It teaches "the world moves
you" in the safest possible world, before Sugarstorm's bumpers and Aurora
Spire's wind lanes ask the player to trust it at speed.

### Particles

Ambient: drifting pollen motes (`#FFE9A8`, 0.4 alpha, slow), falling leaves
(3 rotating sprites). Gameplay: leaf-burst on land, replacing generic grey dust.

### Level-design notes

Existing spec: 20 platforms, 6 hazards, 3 enemies, 20 coins, 2 owls, motifs
`flat_run · small_gap · staircase_up · platform_hop · descent`. **Good bones,
keep the layout.**

- Coins lead the eye up staircases before they lead across gaps.
- Put the first owl at `x≈24` — inside 30 seconds. The first rescue is the hook.
- Both hazards before the first owl should be *visible from a standing start* —
  no first-encounter deaths in the tutorial world.
- Add leaf spouts at the two 3-tile gaps as an optional high route.

### Music

Solo flute over soft strings, ~92 BPM. Birdsong sparse in the top layer. Enters
on a single held note as the level fades in.

### Do not

Mid-day lighting · pure `#00FF00` greens · dense canopy that darkens the play
layer · anything that makes the tutorial world look small

---

# 2 · PRISM HOLLOW
### `level_02` · *Crystal Cave* → **Prism Hollow**

> The light in here is not coming from above. It is coming from the walls, and
> it is the wrong colours.

The contrast beat. World 1 was open, warm and lit from the sky; this is
enclosed, cold and lit from the geology. Hardest-built level in the game
(25 platforms) and it should feel like it.

### Palette

| Token | Hex | |
| --- | --- | --- |
| `sky_top` | `#0E0B26` | cavern void |
| `sky_bottom` | `#1B1440` | |
| `far` | `#241D52` | distant stalactite silhouettes |
| `mid` | `#37306E` | crystal formations |
| `primary` | `#2B2A5E` | violet rock — identity colour |
| `secondary` | `#4B3F7A` | |
| `deep` | `#0E0B26` | |
| `ground_lit` | `#4B3F7A` | lit basalt |
| `ground_shadow` | `#241D52` | shadowed basalt |
| `accent` | `#4DE3FF` | **cyan crystal — the safe light** |
| `light` | `#FF5FD2` | **magenta crystal — the strange light** |
| `hazard` | `#FF7A00` | hot orange, the only warm colour in the world |
| `hazard_base` | `#0A0818` | shard root |
| `enemy_pop` | `#7BE8FF` | |
| `ink_world` | `#0A0818` | |

**The two-light rule.** Cyan and magenta both glow, and the player must never
confuse them. **Cyan is always safe** — platforms, coins, the path, the owls.
**Magenta is always strange** — the Muddle, the deep background, the parts of
the cave you are not meant to walk on. Establish it in the first ten seconds and
never break it. Hazards are neither: they are hot orange, the only warm hue in
the world, so they scream.

### Environment

- **Sky:** near-black violet, no gradient stops visible — this is rock, not air.
- **Far:** inverted stalactite silhouette strip; a distant underground lake
  reflecting cyan at the very bottom.
- **Mid:** three crystal cluster sprites at 0.55 scroll, each with a slow
  0.5→0.9 alpha emissive pulse on a 3s loop, **phase-offset per instance** so
  the cave appears to breathe.
- **Near:** foreground stalagmites, dark silhouette only, 15% coverage.
- **Volumetric shafts:** two magenta light shafts from unseen cracks, 0.10
  alpha, static. They mark the two hardest sections — light as level design.

### Tileset

Dark violet basalt, faceted rather than rounded, with **crystal seams** running
through the fill in `#4DE3FF` at 0.6 alpha. Platform tops carry a 2px cyan
emissive lip — this is how a platform stays readable in a dark world without
brightening the whole tile. Ground fill gets three crystal-embed variants.

### Props

Crystal clusters (four sizes) · dripping stalactites with a 4s drip cycle ·
mineral veins · cave-pearl pools · abandoned Muddle mining scaffolds · a broken
cart with spilled cyan crystals

### Objects

| Object | Look | Behaviour |
| --- | --- | --- |
| **Coin** | gold nugget in a cyan crystal casing | bobs; casts a 12px cyan glow |
| **Hazard** | **Shardspike** — orange crystal shard cluster, upward | pulses 0.8s; the only warm thing on screen |
| **Enemy** | **Shardling** — crystal-crusted grub, one glowing magenta facet, three visible legs | patrols; **freezes when the player stands still** — teaches observation |
| **Owl station** | owl wedged in a crystal geode, cyan glow on its feathers | geode cracks open on rescue |
| **Door** | a crystal arch, dark until approached, then filling with cyan light from the base up | fills over 6 frames |
| **Board frame** | a single hollowed geode, faceted interior, cyan inner glow | facets catch light on entry |

### Signature gimmick — **Mirror crystals**

Rotatable crystals that bounce a cyan beam. Aim the beam at a dark platform and
it **materialises** and becomes standable. Pure spatial reasoning, zero reading,
and it rhymes thematically with maths without ever being a maths puzzle.

### Particles

Ambient: slow-falling cyan motes; occasional magenta spark from a wall.
Gameplay: crystal-shard burst on land; a defeated Shardling pops into cyan
shards rather than dust.

### Level-design notes

Existing spec: 25 platforms, 7 hazards, 4 enemies, 22 coins, 2 owls, motifs add
`narrow_ledge`. **The most complete level in the build. Keep it.**

- Open on a **darkness beat**: 3 seconds of near-black with only Hörmann's scarf
  and a distant cyan glow visible, then the first crystal lights.
- Put the first Shardspike where the player is already committed to a jump but
  can still see it on approach. Threat should be *read*, not *discovered*.
- The two narrow-ledge sections get magenta shafts overhead. Consistent
  vocabulary: magenta means "careful here".
- Both owls sit **above** the critical path. In a dark world, upward is where
  reward lives.

### Music

Glass bells and a bowed pad, ~84 BPM, sparse. Long silences. A single low drum
on the fourth bar. The motif, but slowed and made strange.

### Do not

Blue-grey generic cave · fully black areas the player cannot navigate · red
anywhere (`hurt` is reserved) · a cyan platform that is not standable

---

# 3 · SUGARSTORM
### `level_03` · *Sunny Meadow* → **Sugarstorm Carnival**

> Everything here is trying to give you something.

The reward world, and the one that will make a seven-year-old scream. Casino
Night Zone's kinetics with none of its subject matter: bumpers, ramps, springs,
multipliers, neon, brass. **Zero enemies, zero hazards** — the only thing that
can happen here is that you gain something.

**Why here:** the existing `level_03` spec is 7 platforms with no hazards and no
enemies, which is currently just a *small* level. As a carnival it becomes a
*deliberate* one — the exhale between the cave and the foundry, and the most
memorable screen in the game.

### Palette

| Token | Hex | |
| --- | --- | --- |
| `sky_top` | `#1B0F3B` | deep carnival night |
| `sky_bottom` | `#4B1B6B` | |
| `far` | `#6B2A8A` | distant ferris wheel and tent silhouettes |
| `mid` | `#A83CA0` | |
| `primary` | `#FF4FA3` | hot pink — identity colour |
| `secondary` | `#7B2FBF` | purple |
| `deep` | `#1B0F3B` | |
| `ground_lit` | `#FFD9EC` | cream boardwalk plank |
| `ground_shadow` | `#FF7EC0` | pink boardwalk plank |
| `accent` | `#FFE14D` | bulb yellow |
| `light` | `#2CE0C8` | teal neon |
| `hazard` | `#FF3B6B` | **reserved and unused — this world ships no hazards** |
| `hazard_base` | `#3A0620` | reserved |
| `enemy_pop` | `#FF9AD5` | |
| `ink_world` | `#1A0E2E` | |

Night is essential. Neon does not exist in daylight, and the pink/teal/yellow
triad only sings against a dark violet ground.

### Environment

- **Sky:** deep violet night with **animated bulb strings** garlanded across it,
  chasing left to right on a 2s cycle.
- **Far:** a slowly rotating ferris wheel silhouette in `#6B2A8A` — one sprite,
  one rotation tween, and it does more for the world than a dozen props.
- **Mid:** striped tent canopies, a helter-skelter, and a giant neon `HÖRMANN`
  sign that flickers on the `N`. Self-referential signage is exactly right for a
  carnival, and it is the wordmark in-world.
- **Near:** bunting strung across the top of the frame, gently swaying.
- **Ground glow:** every platform casts a soft coloured bloom downward. This is
  the only world where light comes from below.

### Tileset

Candy-striped boardwalk planks — 2-tile repeat, pink and cream — over painted
scaffold. Platform edges are **chrome bumpers with a bulb strip**, and the bulbs
chase in the direction of travel. Platform tops have a slight bounce compression
of 2px when landed on.

### Props

Striped awnings · popcorn carts · a duck-shoot stall · giant lollipops · a
prize wall of plush owls (**the plush owls are a running joke and they are on
brand**) · balloon bunches that rise when passed · a coconut shy

### Objects

| Object | Look | Behaviour |
| --- | --- | --- |
| **Coin** | gold token stamped with an owl | bobs; **spins on collect and rings like a slot payout** |
| **Hazard** | none | — |
| **Enemy** | **Gumsnap** — sticky blob in a paper crown, wobbling in place. Not hostile: bouncing off one launches you upward | bounces, 1.2s loop |
| **Owl station** | owl on a swing on the ferris wheel, mid-air, feathers everywhere | the wheel lowers it on rescue |
| **Door** | a lit funfair arch, bulbs chasing inward toward the opening | bulbs converge, 6 frames |
| **Board frame** | a prize-stall counter with a striped awning and a bulb border | bulbs chase while a problem is open |

### Signature gimmick — **Bumpers and multiplier ramps**

Round chrome bumpers fling Hörmann across the level with **no input**, and each
bounce increments a `×2 · ×3 · ×4` multiplier on every coin collected until he
touches the ground. Long, loud, entirely safe chains. This is the world children
will replay for its own sake, and every replay routes them past two more owls
and two more maths encounters.

### Particles

Ambient: rising balloons; confetti drifting continuously at 0.3 alpha.
Gameplay: **coins burst in showers of 8, not singles**. This world is generous
and it should look it.

### Level-design notes

Existing spec: 7 platforms, 0 hazards, 0 enemies, 5 coins, 2 owls, motifs
`flat_run · small_gap · platform_hop`. **Too small for the world — grow it.**

- Target **18–22 platforms** and **60+ coins**. Sugarstorm's whole argument is
  abundance; 5 coins reads as an unfinished level, not a carnival.
- Build one continuous **bumper chain of 4+ bounces** as the centrepiece, and
  place it where the player can see it before they can reach it.
- Three owls, not two. This is a rescue-rich world.
- Add a `bounce_chain` motif to `criticalPath.motifs`.
- Nothing in this world may hurt the player. If a future spec adds a hazard
  here, the world is broken.

### Music

Brass, calliope and a walking bass, ~132 BPM — much faster than anything else in
the game. The motif, but as a fairground march.

### Do not

Slot machines, cards, chips, jackpots or any gambling iconography · any hazard
· daylight · muted colour · a coin count that feels stingy

---

# 4 · GEYSERWORKS
### `level_04` · *Mossy Bridge* → **Geyserworks**

> This is where the Muddle make the machine that scrambles the numbers. It is
> hot, it is loud, and it is built on top of something older.

The only genuinely dangerous world, landing immediately after the safest one.
Chemical Plant Zone's industrial menace, built on Icelandic basalt and
geothermal steam rather than generic sci-fi — which makes it specific instead of
stock, and roots it in the place this game comes from.

### Palette

| Token | Hex | |
| --- | --- | --- |
| `sky_top` | `#20161A` | smoke-choked |
| `sky_bottom` | `#5C2A1E` | furnace glow on the horizon |
| `far` | `#3A3B44` | basalt column silhouettes |
| `mid` | `#5A4238` | rusted structure |
| `primary` | `#C2582A` | rust — identity colour |
| `secondary` | `#3A3B44` | basalt |
| `deep` | `#20161A` | |
| `ground_lit` | `#4A3A32` | iron plate |
| `ground_shadow` | `#2A2B33` | basalt underlay |
| `accent` | `#FFA22B` | hot brass |
| `light` | `#FF6B1A` | molten |
| `hazard` | `#FF3B0F` | vent flame |
| `hazard_base` | `#160F12` | vent grate |
| `enemy_pop` | `#C8B08A` | |
| `ink_world` | `#160F12` | |

**This world's ground is deliberately darker than it looks like it should be.**
The iron plate is `#4A3A32`, not a mid-rust brown, because the vent flame
`#FF3B0F` has to clear 3:1 against it and a lighter plate put it at 1.6. Dark
plate under hot vents is also simply the truer image.

Two colour hazards specific to this world, both real:

- `hazard` `#FF3B0F` sits close to `light` `#FF6B1A` and to `hurt` `#FF4D4D`.
  Colour is doing the least work of the three channels here, so the **telegraph
  animation and the jagged silhouette are load-bearing**, not polish. §6.5 is
  not optional in Geyserworks.
- The physically correct colour for the hottest part of a vent is white-hot
  yellow. **Do not use it.** It lands on top of `coin` gold `#FFC93C`, and a
  child confusing a coin with a steam vent is the single worst readability
  failure available in this game. Orange-red is the deliberate, slightly wrong,
  correct choice.

### Environment

- **Sky:** near-black smoke over a furnace-orange horizon band.
- **Far:** hexagonal basalt column silhouettes — the Icelandic signature — with
  rusted pipework bolted across them.
- **Mid:** boilers, riveted tanks, a pressure gauge whose needle actually
  climbs, catwalks, chains with a 2s sway.
- **Near:** a foreground pipe crossing the lower frame, venting steam every 4s.
- **Heat shimmer:** a subtle vertical distortion band above every molten
  surface. One shader, enormous atmospheric return.

### Tileset

Riveted iron plate over hexagonal basalt. **Every platform is visibly bolted to
something** — nothing in this world floats, which is the exact opposite of
Aurora Spire and makes both worlds stronger. Grating platforms show the drop
beneath them. Edges are torn metal. Fill carries rust streaks running downward
from every rivet.

### Props

Pressure valves · gauges with moving needles · conveyor stubs · chain hoists ·
warning stencils in Muddle scrawl (**the only lettering in the game that is not
a real language — it must never look like readable words a child might try to
decode**) · steam vents · slag buckets · a half-built number-crushing machine
in the background with a visible, and visibly broken, gear train

### Objects

| Object | Look | Behaviour |
| --- | --- | --- |
| **Coin** | gold gear-toothed disc | bobs; spins on its own axis |
| **Hazard A** | **Steam vent** — floor grate | 2s cycle: **hiss and glow for 600ms, then erupt**. Always telegraphed |
| **Hazard B** | **Slag pool** — molten channel with a bubbling surface | static, always visible, never surprising |
| **Enemy** | **Slagjaw** — rusted grub in bolted plate, spiked shoulders, one oversized claw, one wheel instead of a leg | patrols; vents steam every 2s as a tell |
| **Owl station** | owl in a hanging cage-lift stuck between floors — **stuck, not imprisoned** (§3.4) | the lift descends on rescue |
| **Door** | a blast door with a rotating lock wheel | wheel spins, door parts horizontally, steam floods out, 6 frames |
| **Board frame** | a riveted iron panel with a brass bezel and four corner bolts | bolts turn on entry |

### Signature gimmick — **Conveyors and piston launchers**

Conveyor belt sections that push Hörmann forward or back, and steam pistons that
fire on a **visible 3s cycle** to launch him upward. The world moves on a beat,
and the player learns to move on it too. Rhythm as level design — the first
world that asks for timing rather than aim.

### Particles

Ambient: rising smoke columns; orange embers drifting upward; falling ash.
Gameplay: a metallic spark shower on land; a defeated Slagjaw pops into bolts
and washers.

### Level-design notes

Existing spec: 11 platforms, 1 hazard, 1 enemy, 8 coins, 3 owls, motifs
`flat_run · small_gap · staircase_up · platform_hop`. **Under-built for a
danger world — grow it.**

- Target **20–24 platforms**, **4–6 hazards**, **3–4 Slagjaws**.
- Add motifs: `conveyor_run`, `timed_gap`, `piston_ascent`.
- **Teach every hazard in a safe room first.** One steam vent with no gap under
  it and nothing else on screen, before any vent is placed over a jump. This is
  non-negotiable in the only world where the player will actually die.
- The three owls should escalate: ground level, then across a conveyor, then at
  the top of a piston ascent.
- End the level looking *down* into the number-crushing machine — the villain's
  work made visible, one screen before the summit world.

### Music

Industrial percussion on struck metal, a low brass drone, ~104 BPM, and a
mechanical hiss on the two-beat. The motif, but hammered out rather than played.

### Do not

Green ooze or toxic-waste iconography · red glowing enemy eyes · an
untelegraphed hazard · a hazard whose only distinguishing feature is its colour
· generic sci-fi chrome

---

# 5 · AURORA SPIRE
### `level_05` · *Treetop Trail* → **Aurora Spire**

> Above the smoke, above the canopy, above the weather. The sky here is doing
> something you have only ever heard about.

The finale, and it goes **quieter**. Fewer objects, more space, the longest
sightlines in the game. Sky Sanctuary's altitude with an Icelandic aurora over
it. The reward for finishing is not more stimulus — it is arrival.

### Palette

| Token | Hex | |
| --- | --- | --- |
| `sky_top` | `#0B1030` | high-altitude near-black |
| `sky_bottom` | `#2A4A8C` | horizon blue |
| `far` | `#1E2A55` | distant peak silhouettes below you |
| `mid` | `#2F4E7A` | floating stone |
| `primary` | `#3A6EA8` | sky stone — identity colour |
| `secondary` | `#1E2A55` | |
| `deep` | `#0B1030` | |
| `ground_lit` | `#C9D6E8` | pale sky-stone |
| `ground_shadow` | `#6E82A6` | stone in shadow |
| `accent` | `#7CF5C4` | **aurora green** |
| `light` | `#A97BFF` | **aurora violet** |
| `hazard` | `#FF6B8A` | wind-shear pink |
| `hazard_base` | `#4A1030` | shear-band core — carries the read against pale stone |
| `enemy_pop` | `#BFD8FF` | |
| `ink_world` | `#0A0C1E` | |

### Environment

- **Sky:** the aurora itself, and it must be the best-looking thing in the game.
  Three additive ribbon layers in `#7CF5C4` and `#A97BFF`, 0.18–0.35 alpha,
  drifting horizontally at different speeds with a slow vertical sine. Stars
  behind, twinkling on a phase-offset 3s cycle.
- **Far:** the peaks of Geyserworks visible **far below**, tiny and smoking.
  Seeing the previous world from above is what makes the climb legible.
- **Mid:** floating basalt islands with grass still clinging on top, trailing
  root systems, and long stone stairs to nowhere.
- **Near:** a thin cloud band that Hörmann passes *through*, alpha 0.25.
- **Cloud sea:** a slow horizontal cloud layer beneath the play field, so every
  gap looks like it drops forever. It does not — the respawn is generous — but
  it should look like it does.

### Tileset

Pale weathered stone with grass on top, like Emberwood's ground torn loose and
lifted. **The rhyme is intentional:** the finale should look like the first
world, reassembled at altitude. Undersides are visible and finished, with
trailing roots — this is the only world where the player regularly sees the
bottom of a platform. Edges are clean breaks, not erosion.

### Props

Standing stones with carved numerals · wind-worn arches · rope bridges between
islands · prayer-flag lines snapping in the wind · lone wind-bent trees · the
Spire itself in the far distance, growing closer each screen

### Objects

| Object | Look | Behaviour |
| --- | --- | --- |
| **Coin** | gold disc with an aurora shimmer across it | bobs; leaves a faint trail |
| **Hazard** | **Wind shear** — a visible pink-white gust band | 0.8s pulse; **pushes rather than damages** — a hazard that costs position, not health, is the right way to end a game for six-year-olds |
| **Enemy** | **Gloomgull** — ragged three-winged bird thing, torn feathers, mismatched eyes, too long | drifts slowly at two fixed heights |
| **Owl station** | owl on the very top of a standing stone, aurora directly behind it — **the best-looking single frame in the game** | flies a full loop before leaving |
| **Door** | the Spire gate: two standing stones with aurora light filling the space between | light fills bottom-up, 6 frames |
| **Board frame** | a floating slab of carved sky-stone, aurora glow behind it, no visible support | slab rotates in gently |

### Signature gimmick — **Wind lanes and updrafts**

Visible horizontal wind currents that carry Hörmann across long gaps, and
vertical updrafts that lift him between island tiers. It is the payoff for
Emberwood's leaf spouts, three worlds later: the same mechanic, now trusted at
altitude, over a cloud sea, at speed. **That is what a finale is** — the first
world's idea, taken seriously.

### Particles

Ambient: aurora shimmer motes; drifting snow crystals; the occasional feather.
Gameplay: a soft cloud puff on land — the quietest landing in the game.

### Level-design notes

Existing spec: 16 platforms, 2 hazards, 2 enemies, 10 coins, 3 owls, motifs
`flat_run · small_gap · staircase_up · platform_hop · descent`. **Right size,
wrong shape.**

- **Make it vertical.** The current motif list ends in `descent`; the finale
  should climb. Replace with `ascent`, `wind_glide`, `updraft_climb`,
  `long_gap`, `summit`.
- Space the platforms further apart than any other world. Emptiness is the
  aesthetic; density here would ruin it.
- Place the final owl at the literal top of the Spire, with the aurora behind
  it and the whole ladder of worlds visible below.
- After the last owl, give the player **8 seconds of nothing** — no enemies, no
  coins, no prompts — walking toward the door with the aurora overhead and the
  music resolving. Games do not do this enough. It is what a child remembers.

### Music

Choir pad, sparse strings, a single struck bell on the bar, ~76 BPM — the
slowest in the game. The motif, finally played in full and unhurried, in a major
key, for the first time since Emberwood.

### Do not

Fill the space · add a boss · daylight blue-sky cheerfulness · any hazard that
takes health at altitude · end on a descent

---

## Cross-world consistency table

The columns that must **never** vary. This table is the answer to "will five
different-looking worlds still feel like one game".

| Element | Fixed across all five worlds |
| --- | --- |
| Coin | gold `#FFC93C`, same 24px silhouette, same collect sound, same 4px bob |
| Owl ring | same position, size, colour, sweep animation |
| Owl rescue | same 1600ms choreography, same hoot, same loop-the-loop |
| Hörmann | same sprite, same scarlet scarf, same animation timings |
| Hazards | jagged silhouette, 0.8s idle loop, two-tone `hazard_base` + `hazard`, always visible before they can be touched |
| HUD | identical layout, identical positions, identical behaviour |
| Maths board | identical 520×280 geometry, identical button grid, identical timings |
| Wrong answer | identical 900ms choreography, amber, never red |
| Correct answer | identical 700ms choreography, streak-pitched chime |
| Door | 88×96, 6-frame open, always at the right edge |
| Type | same scale, same stroke weights |
| Motion | the five-step duration ladder, no exceptions |

**Skins change. Grammar does not.** A child who learns to read Emberwood can
read Aurora Spire on their first frame, and that is what lets each world be as
different as it likes.

---

## Renaming the levels

The five world names are player-facing strings, so this is not a free rename.
`level.level_0N.name` lives in **four** bundles — `godot/data/i18n/strings_{en,is}.json`
and `godot/data/i18n/strings_{en,is}.json` — and `tools/validate_i18n.mjs`
enforces a hard **240px box at 20px type** on each of them
(`ADVANCE_RATIO = 0.63`, so 19 characters is the ceiling).

Measured against that budget, all ten names fit:

| Level | English | px | Icelandic | px |
| --- | --- | --- | --- | --- |
| `level_01` | Emberwood Run | 164 | Emberskógur | 139 |
| `level_02` | Prism Hollow | 151 | Prismahellir | 151 |
| `level_03` | Sugarstorm | 126 | Sykurstormur | 151 |
| `level_04` | Geyserworks | 139 | Hverasmiðjan | 151 |
| `level_05` | Aurora Spire | 151 | Norðurljósatindur | **214** |

Aurora Spire's Icelandic name has 26px of headroom and is the tightest string
in the game — if the level-select type ever grows past 20px, it is the first
thing that breaks. Every accented character used (`ó` `ð` `í`) is in Latin-1
Supplement, so the allowlist guard passes.

The Icelandic names are proposals from a brand point of view, not a
translation sign-off. `Hverasmiðjan` ("the geyser forge") and `Emberskógur`
("ember forest") in particular should be read by a native speaker before they
ship — they need to sound like places a child would want to go, which is not
something a fit budget can check.

`level_registry.json` also carries an untranslated `name` field per level;
update those in the same pass or they will drift from the bundles.

---

## Production order

Sequenced so that something is visibly better after every step.

| Step | Work | Output |
| --- | --- | --- |
| 1 | Drop the five token files into `godot/data/themes/`, register in `ThemeManager.THEME_KEYS`, applied per level by `game.gd` | **five distinct-looking worlds with zero new art** — palette, board, HUD tint and scrim all change |
| 2 | Five 32px tilesets (9 tiles each) | worlds become places |
| 3 | Five sky + far + mid parallax sets | worlds gain depth and scale |
| 4 | Four new enemy sheets | escalation becomes visible |
| 5 | Five owl stations, five doors, five coin skins | the loop gets its identity |
| 6 | Signature gimmicks, one per world | worlds become different to *play*, not just to look at |
| 7 | Five music arrangements, re-recorded SFX | the whole thing lands |

Step 1 is a day of JSON and three small code changes, and it fixes the single
biggest art problem in the build: **six levels that currently all declare
`"theme": "forest"` and loaded the same tileset. Both are now fixed: the specs name the five worlds and each selects its own tileset.**
