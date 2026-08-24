# Hörmann — Brand & Art System

Status: Supportive
Authority: Canonical brand, art-direction and UI standard. Runtime truth still lives in `src/**`, `public/data/**` and the manifests.
Last verified against code: 2026-08-24

This is the one brand file. If another document disagrees with this one about
colour, type, motion, tone or HUD layout, this one is right and the other one is
stale. Per-world art detail lives in its companion, [LEVEL_ART_BIBLE.md](./LEVEL_ART_BIBLE.md).

Machine-readable palette tokens for every world live in [tokens/](./tokens/) in
the exact shape `ThemeDefinition` expects.

---

## 0. The problem this document exists to solve

Findings from the current build, 2026-08-24:

| Symptom | Evidence | Consequence |
| --- | --- | --- |
| Every level looks the same | all six `*.spec.json` declare `"theme": "forest"`, and every entry in `level_registry.json` loads the same `level1_tiles.png` | there is no sense of travel; world 5 feels like world 1 |
| The theme system is built but unused | `ThemeManager` supports swapping, only `forest` and `scifi` are registered, and `scifi` is never selected | the most valuable art lever in the codebase is idle |
| One enemy exists | `enemy_registry.json` contains `cockroach_basic` and nothing else | no escalation, no world identity, no reason to look up |
| The HUD is a left-edge text stack | `HUDScene` places health at `16,16`, coins at `16,56`, owls at `16,88` | the goal metric (owls saved) has the same visual weight as a debug readout |
| Failure is painted red | `MathBoard.showWrongFeedback()` fills the chosen button with `danger` for 400ms and flies "Try again" up in a hardcoded `#ff6666` | the most confidence-sensitive moment in the game uses the colour of damage |
| Colour has no law | palette keys are duplicated verbatim between `theme_forest.json` and `theme_scifi.json` | "themes" currently differ in four colours out of twenty-four |

Everything below is written to close those six gaps.

---

## 1. Positioning

**Hörmann is an adventure game that happens to teach maths. It is not a maths app with a character on it.**

The distinction is operational, not poetic. It decides arguments:

- The reward for answering is **progress in the adventure**, never a grade.
- The owl is a **friend you rescue**, never an examiner.
- A wrong answer costs **time**, never **health, coins, streak or standing**.
- Numbers appear inside the world's material — carved, cast, grown, forged — never floating in a worksheet box.

**Core promise:** *Every session, you go somewhere new and you bring an owl home.*

**Who it is for:** a 6–8 year-old playing 10–20 minutes at a time, at home,
often on a tablet, often next to a parent, often the youngest and least
confident player in their friend group.

**Who it is not for:** speedrunners, adult retro-platformer nostalgics, and
classrooms with a marking scheme. We will happily be enjoyed by all three. We
will not be designed for them.

**Three words:** *Brave. Bright. Kind.*

**The one-line pitch:** *A scrappy crow, five wild worlds, and a lot of owls who need rescuing.*

---

## 2. Hörmann — the hero

The existing 64px sprite is already right: a dark corvid with a scarlet
face-mask and a raised crest. It reads as *scrappy and a bit punk*, not cute and
not grim. That is the correct register. Do not soften it into a mascot and do
not harden it into an edgelord.

### 2.1 Character truth

- Hörmann is **small, fast and brave** — he is the least powerful thing in most
  rooms and goes in anyway.
- He is **curious before he is aggressive**. The peck is how he opens things,
  not how he solves things.
- He **never speaks**. All voice comes from the owls and from UI copy. A silent
  hero is a hero any child can be.

### 2.2 The silhouette law

At 64px, before any colour is applied, Hörmann must be identifiable from his
black shape alone. Three features carry that:

1. **The crest** — three raised feathers, asymmetric, tallest at the front.
2. **The scarf** — *new, and the single highest-value addition in this document.*
3. **The stance** — head forward of the feet in every locomotion frame.

### 2.3 The scarf

Add a **scarlet flight-scarf** (`#E23B3B`, the one shade of red allowed on the
hero) trailing 20–28px behind him.

Why this is worth the sprite work:

- It gives him a **logo** — the scarf silhouette alone is the app icon.
- It gives every frame **secondary motion** for free. A 3-segment scarf that
  lags the body by 2, 4 and 6 frames makes an 8-frame run cycle look like a
  24-frame one.
- It makes him **readable against every world palette**. Scarlet survives on
  green forest, dark violet cave, hot rust foundry, hot pink carnival and cold
  indigo sky. Nothing else in the palette does.
- It is **the state channel**. Scarf behaviour is how the player reads Hörmann
  without looking at the HUD:

| State | Scarf behaviour |
| --- | --- |
| Idle | slow 2px sway, 1.2s period |
| Run | streams horizontally, 3-segment lag |
| Jump rise | whips upward, fully extended |
| Fall | flutters vertically, high frequency |
| Hurt | goes limp for 400ms, desaturates to `#8A2A2A` |
| Streak ×3+ | trails 4 gold sparks per second (`#FFC93C`) |
| Ability active | takes the ability's accent colour for its duration |

### 2.4 Animation set

Base resolution is `960×540` at integer 2× (`Constants.ts`). All sprite work is
authored on a **1px grid at 64px** and never scaled non-integer.

| Animation | Frames | FPS | Notes |
| --- | --- | --- | --- |
| `idle` | 4 | 6 | breathing on the body, blink on frame 3 only |
| `idle_long` | 6 | 6 | after 8s idle: he looks at the camera, ruffles, resettles |
| `run` | 8 | 14 | contact / down / pass / up × 2 |
| `jump_anticipate` | 1 | — | held 60ms, crouch, scaleY 0.88 |
| `jump_rise` | 1 | — | scaleY 1.12 / scaleX 0.92 |
| `apex` | 1 | — | held while `|vy| < 60` — the float that makes jumps feel generous |
| `fall` | 2 | 10 | |
| `land` | — | — | code, not frames: squash to `1.18/0.82` over 80ms, overshoot to `0.96/1.06`, settle over 120ms |
| `peck` | 5 | 18 | frames 1–2 are anticipation, backwards |
| `hurt` | 2 | 8 | + 400ms invulnerability flicker at 12Hz |
| `celebrate` | 6 | 10 | wings up, crest flared — plays on owl rescue |

**Anticipation is mandatory.** Every action that costs the player something gets
1–2 frames of the opposite motion first. This is the difference between "the
controls are floaty" and "the controls feel good", and it costs two frames.

---

## 3. The Muddle — the antagonists

The enemy faction is **the Muddle**: grimy, disorganised creatures that scramble
numbers and cage owls. One faction, five regional species, so escalation is
legible at a glance.

### 3.1 The ugly law

The brief asks for ugly enemies. Ugly is a design spec, not a vibe:

**Ugly means:**
- **Asymmetric.** One eye bigger. One limb longer. Nothing mirrors.
- **Lumpy.** Silhouettes bulge; no clean arcs.
- **Over-limbed.** Too many legs, always an odd number visible.
- **Snaggled.** One tooth out, one antenna bent, one wing torn.
- **Badly assembled.** Their gear is taped on, mismatched, clearly stolen.

**Ugly does not mean scary.** Non-negotiable, because the audience is six:
- No glowing red eyes. Eyes are **yellow, mismatched, and too big for the head**.
- No blood, no gore, no skulls, no realistic insect detail.
- No lunging at the camera. No screen-filling reveals. No jumpscares.
- They **grumble**, they do not roar. Audio never exceeds 0.5 volume.
- **They never win a chase.** Every Muddle is slower than Hörmann.

### 3.2 The defeat rule

A defeated Muddle **deflates and pops into a puff of coloured dust and three
coins**. It never dies on screen. The pop is comic — a wet raspberry, not an
explosion. `DopamineFX.enemyDeath` currently uses red particles (`0xff4444`);
retint to the world's `enemy_pop` colour so a defeat reads as *world flavour*,
not as *harm*.

### 3.3 Roster

One per world, escalating in size and silhouette complexity. All 64px.

| World | Species | Silhouette | Behaviour | Registry id |
| --- | --- | --- | --- | --- |
| Emberwood | **Grubbin** — the existing cockroach, retinted olive | low, wide, five legs | patrol, turns at ledges | `cockroach_basic` |
| Prism Hollow | **Shardling** — crystal-crusted grub, one glowing facet | angular, hunched | patrol, freezes when Hörmann is still | `shardling_basic` |
| Sugarstorm | **Gumsnap** — a sticky blob wearing a paper crown | round, wobbly, top-heavy | bounces in place, harmless if you time it | `gumsnap_bouncer` |
| Geyserworks | **Slagjaw** — rusted grub in bolted plate armour | boxy, spiked shoulders, one huge claw | patrol, vents steam every 2s (telegraph) | `slagjaw_armored` |
| Aurora Spire | **Gloomgull** — ragged three-winged bird thing | tall, thin, torn wings | slow horizontal drift at two heights | `gloomgull_drifter` |

Every one of these is a **new `enemy_registry.json` entry plus one 64px sheet**.
Nothing else in the codebase has to change — `NPCFactory` and `Enemy` already
read the registry.

### 3.4 Professor Hoot and the owls

Owls are the **warm centre** of the brand. Everything about them is the opposite
of the Muddle: symmetrical, round, soft-edged, big calm eyes, no teeth.

- Professor Hoot wears **round spectacles and a knitted scarf** — the scarf is
  the same shape as Hörmann's, in the world's accent colour. Visual rhyme:
  *the owls are on your team*.
- Owls are **never** drawn caged, bound, or distressed. They are drawn
  **stuck** — wedged in a crack, tangled in vines, sat on a ledge too high.
  Rescue, not liberation from cruelty.

### 3.4a Chains

An owl is held by **chain links**, and **one correct answer breaks one link**.

**The default owl has one link.** A child runs, meets an owl, answers one
question, the chain snaps, and they are running again. Quick maths and action,
every time — that is the resting rhythm of the game, and anything slower is the
exception rather than the norm.

Longer encounters are opt-in, per NPC, from `public/data/npcs/npc_registry.json`:

| Registry id | Links | Band | Where it belongs |
| --- | --- | --- | --- |
| `owl_teacher_01` | 1 | 1–2 | the default; use it unless a level wants otherwise |
| `owl_gentle_01` | 1 | 1–1 | a world's opening beat, or after a run of misses |
| `owl_tough_01` | 1 | 3–4 | a spike in difficulty that costs no extra time |
| `owl_twin_chain` | 2 | 1–3 | costs time rather than difficulty |
| `owl_triple_chain` | 3 | 1–3 | a set piece — it stops the run for a while |
| `owl_gauntlet` | 3 | 3–5 | reserve for a world's final owl |

`behaviorConfig.chainLinks` mirrors the math component's `problemCount` so art
and the HUD can read the number without reaching into the component config. It
is **not** a second source of truth — `npm run validate` fails if the two
disagree.

**Drawing the chains.** One link per remaining answer, drawn across the owl's
perch rather than around the owl itself — the owl is stuck, not imprisoned
(§3.4). A link bursts on each correct answer with the world's `enemy_pop`
colour, and the last one takes the whole perch with it. A three-link owl must
read as *more* at a glance, before the child commits to the encounter, so they
can choose to come back later.

**A consequence worth knowing:** the streak (§10.2) counts answers, not owls, so
with one-link owls a streak of 3 means three owls rescued in a row — which is
what makes the tiers reachable at all. See `roadmap.md`.
- On rescue the owl does one full loop-the-loop, hoots once, and flies off the
  top of the screen. Same animation in every world. That repetition is the point
   — it becomes the sound of success.

---

## 4. Voice

Copy is currently good and should stay in this register (`strings_en.json`:
*"Let's try one together!"*, *"Let's try again!"*). Codify it.

### 4.1 Tone traits

**Encouraging, plain, short, warm.** Written to be read aloud by a parent to a
child who is still learning to read.

### 4.2 Rules

- **Max 8 words per UI line.** Max 12 for owl dialogue.
- **Second person, present tense.** "You saved an owl!" not "An owl was saved."
- **"We" and "let's" for anything hard.** "Let's try again" shares the load.
- **Exclamation marks are earned, not default.** One per screen, maximum.
- **Never name the failure.** "Let's try again!" — never "Wrong", "Incorrect",
  "Nope", "Oops, that's not it".
- **Never praise intelligence, always praise action.** "Nice thinking!" not
  "You're so smart!" — the second one makes the next mistake feel like a
  character flaw.
- **No sarcasm, no irony, no adult wink.** Ever. The parent is welcome; the
  parent is not the audience.
- **No time pressure language.** No "Quick!", "Hurry!", "Fast!" anywhere near a
  maths problem.

### 4.3 Avoid list

`Wrong` · `Incorrect` · `Failed` · `Error` · `Score` · `Grade` · `Test` ·
`Quiz` · `Exam` · `Lesson` · `Homework` · `Practice makes perfect` ·
`smart` / `clever` as a compliment · anything ending in `!!`

### 4.4 Localisation

Icelandic is a shipping locale and `tools/validate_i18n.mjs` enforces a Latin-1
allowlist and a per-key fit budget. Two brand consequences:

- **Never lay out a UI element to fit the English string.** Budget every label
  slot at **1.4× the English width**. Icelandic compounds are long.
- **The wordmark keeps its umlaut.** `HÖRMANN`, always. It is the name, it is
  Icelandic, and it is a distinctive letterform. Never `HORMANN`.

---

## 5. Visual foundation

### 5.1 The pixel law

- Base canvas **960×540**, integer 2× to 1920×1080. Never fractional scaling on
  desktop.
- Tiles **32px**. Characters and props **64px**. Icons **32px** or **16px**,
  nothing between.
- **One pixel size everywhere.** A 64px sprite drawn at 1× and a 32px tile drawn
  at 1× must have the same apparent pixel. Mixed pixel density is the single
  most common way a pixel-art game looks amateur.
- **No anti-aliasing, no soft shadows, no gradients inside sprites.** Gradients
  are allowed only in sky layers and in additive light overlays.
- **No rotation of pixel sprites except by 90°.** Rotate a container, never a
  sprite — or accept the shimmer and pick a different effect.

### 5.2 The silhouette test

Every asset must pass this before it ships: **fill it 100% black on a mid-grey
field. If you cannot tell what it is and whether it will hurt you, redraw it.**

Applied consequences:
- Hazards get a **spiked or jagged** silhouette. Nothing else in the game does.
- Interactables get a **round** silhouette. Nothing hostile is round.
- Platforms are **flat-topped and horizontal**. Decoration never has a flat top
  wide enough to look standable.

### 5.3 The outline law

- Every gameplay-relevant object carries a **1px outline in the world's `ink`
  colour** (a warm near-black, never `#000000`).
- Background and parallax layers carry **no outline at all**. This is what
  separates "you can touch this" from "this is scenery" without a tutorial.
- Interactable objects get a **1px white inner rim on the top-left edge** that
  pulses 0.6→1.0 alpha over 1.4s. That pulse is the game's universal *"press
  here"* signal, in every world, forever.

### 5.4 Depth stack

Five layers, fixed scroll factors, every world:

| Layer | Scroll | Contents | Saturation | Value |
| --- | --- | --- | --- | --- |
| `sky` | 0.0 | gradient + celestial body | 30% | brightest |
| `far` | 0.25 | horizon silhouettes | 40% | light |
| `mid` | 0.55 | structures, big flora | 70% | medium |
| `play` | 1.0 | tiles, actors, hazards, pickups | **100%** | full range |
| `near` | 1.35 | foreground blur-frames, max 15% screen coverage | 60% | darkest |

**The play layer is the only layer at full saturation.** That single rule is how
five very different worlds all stay readable with the same HUD on top.

---

## 6. Colour architecture

Colour is split in two: **nine values that never change**, and everything else,
which changes completely per world.

### 6.1 The Fixed Nine

These are **brand constants**. They are the same hex in all five worlds, in the
menus, in `admin.html`, and in any store or marketing asset. A child learns them
once, in world 1, and they are never re-taught.

| Token | Hex | Means | Where it is allowed |
| --- | --- | --- | --- |
| `ink` | `#1A1420` | outline, text shadow | outlines, text stroke |
| `paper` | `#FFF8E7` | UI text, panel highlights | all body text |
| `coin` | `#FFC93C` | reward | coins, coin FX, coin chip |
| `owl` | `#FFE9A8` | the goal | owl ring, owl icon, rescue burst |
| `yes` | `#4CE080` | correct | correct answer, unlock, completion |
| `notyet` | `#E08A2E` | try again | **wrong answers, and nothing else** |
| `hurt` | `#FF4D4D` | physical damage | **damage only, and nothing else** |
| `hero` | `#E23B3B` | Hörmann | scarf, player marker, focus ring |
| `focus` | `#FFFFFF` | pressable | interactable rim pulse, keyboard focus |

### 6.2 The red rule

**Red means "you got hit". Amber means "not yet". They are never swapped and
never mixed.**

This is the most important colour decision in the document. In a game whose
entire purpose is to make a six-year-old comfortable being wrong, the colour of
danger must never appear on a maths answer. Two code changes follow directly:

- `MathBoard.showWrongFeedback()` fills the chosen button with
  `tm.getColorNum('danger')` and flies its "Try again" text up in a hardcoded
  `#ff6666`. Both become `notyet` `#E08A2E`. (`DopamineFX.wrongShake` itself
  only displaces `x` and needs no change.)
- `theme_*.json` `wrongFx: "shake_red"` becomes `shake_amber`.

### 6.3 Per-world variables

Everything else is a world variable. Each world owns:

`primary` · `secondary` · `accent` · `ink_world` · `sky_top` · `sky_bottom` ·
`far` · `mid` · `deep` · `ground_lit` · `ground_shadow` · `boardBg` ·
`boardBorder` · `buttonBg` · `enemy_pop` · `hazard` · `hazard_base` ·
`light` (the world's emissive/glow colour)

### 6.4 The five worlds at a glance

| World | Hue story | `primary` | `accent` | `light` | Feels like |
| --- | --- | --- | --- | --- | --- |
| 1 · **Emberwood** | warm greens under a peach dawn | `#3F8F5B` | `#FFC93C` | `#FFD98A` | waking up |
| 2 · **Prism Hollow** | violet dark, cyan and magenta emissive | `#2B2A5E` | `#4DE3FF` | `#FF5FD2` | holding your breath |
| 3 · **Sugarstorm** | hot pink and teal on deep night | `#FF4FA3` | `#FFE14D` | `#2CE0C8` | showing off |
| 4 · **Geyserworks** | rust and basalt, molten orange | `#C2582A` | `#FFA22B` | `#FF6B1A` | pushing through |
| 5 · **Aurora Spire** | cold indigo, aurora green and violet | `#3A6EA8` | `#7CF5C4` | `#A97BFF` | arriving |

Full tables, tilesets, props and object lists are in
[LEVEL_ART_BIBLE.md](./LEVEL_ART_BIBLE.md). Copy-paste tokens are in
[tokens/](./tokens/).

### 6.5 Contrast floor

These are checked, not asserted. [tokens/verify_palettes.py](./tokens/verify_palettes.py)
runs all of them across all five worlds and exits non-zero on a violation. Two
of the rules below exist because the first draft of the tokens failed them.

- **Text on any panel: 4.5:1 minimum.** Worst case in the five worlds is
  Geyserworks accent-on-board at 5.53.

- **`yes` and `notyet` must separate on luminance, not only hue: 1.5:1
  minimum.** They are the two states a child has to tell apart, side by side, on
  the answer board. The obvious bright amber `#FFB347` sits at 1.04 against
  `yes` green — under deuteranopia the correct and incorrect buttons become the
  *same colour*. `notyet` is therefore the deeper `#E08A2E`, at 1.57.

- **Hazards are two-tone, and the pair must clear 3:1 against both ground
  values.** A single hazard colour cannot do this: Emberwood's ground runs from
  lit grass (`#5FB574`, luminance 0.367) to shadowed dirt (`#6B4A2E`, 0.082),
  and no one value beats both. So every hazard is drawn as a dark base in
  `hazard_base` with a bright tip in `hazard`, and **whichever of the two wins
  on a given surface is the one that carries the read.** Verified worst case is
  Geyserworks at 3.03.

- **Hazards must not be confusable with coins: 1.5:1 minimum.** This is why
  Geyserworks' vent core is orange-red `#FF3B0F` and not the physically-truer
  white-hot yellow — yellow-hot would have landed on top of `coin` gold.

- **Never place `notyet` amber directly on `coin` gold**, and vice versa. 1.74
  at the chosen values; they merge below that.

Hazards additionally carry a jagged silhouette and a 0.8s idle animation.
**Three redundant channels — shape, motion, luminance. Never colour alone.**

---

## 7. Typography

There is a settled decision in `roadmap.md`: **no bundled webfont**, because
Icelandic needs 16 Latin-1 Supplement letters and decorative glyphs used as UI
primitives caused missing-glyph bugs. That decision stands. Type direction works
within it.

### 7.1 Two faces, both system

| Role | Stack | Used for |
| --- | --- | --- |
| **Display** | `monospace` — the existing choice, kept | numbers, HUD counters, the maths problem, level titles |
| **Body** | `system-ui, sans-serif` | owl dialogue, menu labels, settings, `admin.html` |

Monospace for numerals is not a compromise, it is correct: **digits do not
change width when the value changes**, so a counter never jitters and a maths
problem never reflows mid-read.

### 7.2 The scale

Authored at 960×540. Six steps, nothing between them.

| Step | Size | Weight | Use |
| --- | --- | --- | --- |
| `hero` | 64px | bold | `LEVEL UP!`, world card titles |
| `title` | 48px | bold | `Level Complete!`, menu title |
| `problem` | 56px | bold | the maths problem — **the largest thing on screen during a challenge** |
| `answer` | 40px | bold | answer buttons |
| `label` | 24px | regular | HUD counters, hints, buttons |
| `caption` | 16px | regular | secondary info, `admin.html` tables |

### 7.3 Text rendering rules

- Every piece of gameplay text carries a **`ink` stroke**: 4px at `hero`/`title`,
  3px at `problem`/`answer`, 2px at `label`/`caption`. This is what lets text
  survive over any world.
- **Never centre-align more than two lines.** Owl dialogue is left-aligned.
- **Never letter-space monospace.** It is already spaced.
- Minimum touch-target text: `label`. Nothing smaller is ever tappable.

---

## 8. The interface system

### 8.1 Layout law

- **8px baseline grid.** Every position and size is a multiple of 8.
- **Safe area: 24px** from every canvas edge on desktop, **32px** on touch, to
  clear rounded corners and gesture bars.
- **Corner radius: 12px** on panels, **8px** on buttons, **0px** on anything
  that is diegetic world material (a carved stone sign has no radius).
- **Touch targets: 64×64 minimum, 80×80 for the primary action.** A seven-year-
  old's finger and a seven-year-old's aim are both bigger than an adult's.

### 8.2 The HUD, redesigned

**What is wrong now:** `HUDScene` stacks health at `16,16`, coins at `16,56` and
owls at `16,88` — three left-aligned rows of equal weight. The consequence is
that *owls saved*, which is the entire goal of the game, is presented with the
same authority as a coin count. And the whole thing sits inside the 24px safe
area at `16px`.

**The rule:** *the HUD shows what you have, what you are chasing, and nothing
else. What you are chasing is the biggest thing on it.*

Three pods on a 960×540 canvas:

**Left pod — LIFE — at `(24, 24)`**
- Three hearts, `28×28`, 8px gap, `hurt` `#FF4D4D`, `ink` outline.
- Loss: heart shatters into 4 shards, **120ms hitstop**, screen-edge red
  vignette pulse at 0.25 alpha for 200ms. `DopamineFX.damageFlash` currently
  covers the *whole* screen at 0.3 — that is too much for six-year-olds. Make it
  an **edge vignette**, not a full wash.
- Gain: heart draws in with `Back.easeOut` over 260ms + soft chime.

**Right pod — THE OWL RING — at `(936, 24)`, right-aligned**
- A **56px circular progress ring** in `owl` `#FFE9A8` with the owl icon inside.
- Segments = owls in this level. Each rescue fills one segment with a 400ms
  sweep and pops the ring to 1.15 scale and back.
- **This is the dopamine anchor of the whole game.** It answers "how close am I"
  at a glance, without reading a number, which matters enormously for a player
  who is still learning to read.
- Session total sits under it in `caption`, dim.

**Coin chip — at `(24, 72)` — idle-fading**
- Coin icon + count in `label`.
- **Fades to 0.35 alpha after 3s without a coin.** Snaps to 1.0 and pops on
  collect. Idle-fade is how a modern HUD stays out of the way without a settings
  toggle.

**Ability slots — move to bottom-right, above the touch controls**
- Currently at `GAME_WIDTH - 160, 16`, which now collides with the owl ring.
- Two slots, `64×64`, `ink` outline, filled with the ability's accent glow when
  charged, greyscale at 40% when not.

**Top centre stays empty.** It is reserved for the level banner on entry and for
streak toasts. An empty top-centre is what makes a streak toast feel like an
event.

**Touch controls** keep their current positions but gain: 80×80 primary action,
`focus`-white 2px rim, 0.55 idle alpha rising to 0.9 on press, and a 4px
`Back.easeOut` press depression.

### 8.3 The maths board

`MathBoard` currently draws a 520×280 rounded panel with a 56px question and
100×60 option buttons at 24px gaps. The bones are right. Six changes:

1. **Buttons to `88×88`, gap `24`.** 100×60 is a landscape rectangle, which
   reads as a *label*. A square reads as a *button*, and 88 clears the 64px
   touch floor with room for a seven-year-old's aim.
2. **The board never covers Hörmann.** Anchor it to the upper 60% of the canvas
   and pan the camera so the player stays visible below it. The child should
   never lose sight of who they are while they think.
3. **Diegetic frame per world.** The board is made of the world's material —
   bark, crystal, candy, iron, sky-stone — not a generic rounded rect. Same
   layout, same button grid, same timings in all five. **Skin changes, geometry
   never does.**

   Today the board is themed by *colour only*: `frameSprite`, `bgSprite` and
   `optionSprite` are declared in every theme file and none has a texture, so
   `MathBoard` draws a rounded rect from the palette. Emberwood and Geyserworks
   are the same shape in different browns, and that is the largest remaining
   gap between this document and the running game.

   **The frame must be a nine-slice.** The board measures its question, options
   and hint and grows to fit — a two-line prompt takes it to roughly 380 tall —
   so a fixed-size PNG will stretch and smear its corners. The asset is a
   nine-slice source plus border insets carried in the theme file.
   `brand/ASSET_MANIFEST.md` P4 has the sizes; `roadmap.md` has the code change
   `MathBoard.drawBoardBackground()` needs to accept one.
4. **Entry: 260ms `Back.easeOut` from scale 0.85** (not from 0 — a full
   zero-scale pop is disorienting at this size), with the world's dust settling
   around it.
5. **Answer buttons stagger in** at 40ms intervals, left to right. Free
   perceived polish, costs one delay parameter.
6. **The problem text is the largest thing on screen.** `problem`/56px, always.
   Nothing during a challenge may exceed it.

### 8.4 The wrong-answer choreography

This is the most important second in the product, and it is currently the least
designed one.

**What the code actually does**, as of 2026-08-24 — worth stating precisely,
because `roadmap.md`'s P2 entry describes this lockout as "roughly three to four
seconds" and the source does not agree:

| Path | Timing |
| --- | --- |
| Board opens | `UINavigator` enabled at 450ms (`MathBoard:146`) |
| First wrong answer | chosen button filled `danger` red for 400ms; "Try again" flies up in hardcoded `#ff6666`; hint fades over 300ms; input re-enabled at **600ms** (`MathBoard:306,336`) |
| Second wrong answer | overlay dismissed at 800ms (`MathChallengeScene:199`) |
| Correct answer | **1500ms** hold before the challenge closes — deliberate, per the comment: *"longer delay for dopamine absorption (1.5s for 6-year-olds)"* (`MathChallengeScene:183`) |

So the roadmap's *duration* claim does not match the source, but its *substance*
does: the other buttons never change state, so a child who retries during the
600ms gets silence. **Re-measure on a device before changing numbers** — the
gap between 600ms and "feels like four seconds" is itself the finding, and it
is probably the 1500ms correct-answer hold or a slow problem-type path being
attributed to the wrong branch.

The spec below keeps the 600ms input gate roughly where it is, extends it
slightly for a legible beat, and fixes what is actually wrong: the colour, and
the fact that nothing tells the child the buttons are asleep.

**Fixed total: 900ms, identical for every problem type.**

| t | What happens |
| --- | --- |
| `0ms` | chosen button dims to 45%, gains a 2px `notyet` amber rim, shakes 3× 4px over 120ms. **No red. No X. No buzzer.** |
| `0ms` | all buttons drop to 55% alpha — *visibly* not accepting input, which is the roadmap's actual complaint |
| `120ms` | soft, low, short "hm" tone at 0.35 volume. Curious, not disappointed |
| `160ms` | Professor Hoot leans in from the board edge, one blink |
| `200ms` | hint line fades in over 200ms in `accent`, `label` size |
| `400ms` | **after the first miss only:** the correct button begins a slow `focus` white rim breathe, 0.7→1.0 alpha over 900ms — the game's established *"press here"* signal (§5.3), **not** amber, which already means *"the one you picked was not it"*. Second miss, it stays on |
| `900ms` | all buttons return to 100%, input re-enabled, Hoot settles back |

**Never on a wrong answer:** health loss · coin loss · streak reset · red ·
a downward sound · a shrinking bar · a countdown · the word "wrong" ·
progress moving backwards in any visible way.

The streak resets **only** on leaving a level. A wrong answer costs 900ms of
adventure and nothing else. That is the whole disincentive, and for this
audience it is enough.

### 8.5 The correct-answer choreography

**Choreography: 700ms. Then hold.**

`MathChallengeScene` currently waits 1500ms after a correct answer before
closing, with a comment saying the delay is deliberate for six-year-olds. That
judgement is right and this spec does not overrule it. What is wrong is that
most of those 1500ms are currently *static* — the child waits on a finished
screen. The 700ms below **fills** the first half; the remaining ~800ms becomes
the owl-ring sweep settling and the board easing out, so the same total elapsed
time reads as a celebration instead of a pause.

| t | What happens |
| --- | --- |
| `0ms` | button snaps to `yes` green, scales to 1.2 and back over 140ms `Back.easeOut` |
| `0ms` | bright short chime, rising, **pitched up 1 semitone per streak step** (caps at +5) — the audio equivalent of a combo counter, and children chase it hard |
| `80ms` | 12 `yes`-green sparks burst from the button |
| `140ms` | the other buttons fade out over 160ms |
| `200ms` | Professor Hoot does one wing-flap |
| `300ms` | `+1` flies from the button to the owl ring, leaving a 5-particle trail |
| `450ms` | the owl ring segment sweeps and pops |
| `700ms` | board exits, 180ms `Back.easeIn`, camera returns to the player |
| `700–1500ms` | the existing hold, now occupied: ring glow settles, coins finish arriving, Hoot waves off |

### 8.6 Component inventory

Every UI element in the game is one of these. Adding a tenth requires a change
to this document.

| Component | Spec |
| --- | --- |
| **Panel** | 12px radius, `boardBg` fill, 3px `boardBorder`, 2px `ink` drop offset down-right |
| **Primary button** | 88×88 or 240×72, 8px radius, `buttonBg`, 2px `ink`, `paper` label, 4px press depression |
| **Chip** | 32px tall pill, icon + `label` text, idle-fades to 0.35 |
| **Ring** | 56px, 6px stroke, segmented, sweeps clockwise from 12 o'clock |
| **Toast** | top-centre, slides down 24px + fades in 200ms, holds 1200ms, exits up |
| **Dialogue box** | bottom third, 64px portrait left, text left-aligned, 30 chars/sec typewriter, tap to complete |
| **World card** | level-select tile, 240×160, world key-art, name in `title`, owl ring + coin chip below |
| **Modal** | scrim `#1A1420` at 0.72, panel centred, 260ms `Back.easeOut` |
| **Focus ring** | 3px `focus` white, 4px offset, 1.4s pulse — keyboard and gamepad navigation |

### 8.6b The HUD carries its own contrast

**A HUD element may never borrow its legibility from the world behind it.**

This rule exists because the concept for the owl ring was mocked over a
gameplay screenshot, which quietly let the scene supply the darkness the ring
needed. Implemented against a real Emberwood dawn, the ring became the *least*
visible thing on screen — the exact inverse of a goal anchor — and the coin chip
was unreadable text on peach.

The fix is two-sided, and both sides are required:

- **An `ink` fill or bezel**, so the element separates from a bright world
  (Emberwood's dawn, Sugarstorm's cream boardwalk).
- **A 1px `paper` rim at 0.22**, so it still separates from a near-black one
  (Prism Hollow, Geyserworks, Sugarstorm's night sky), where an `ink` fill is
  the same colour as the world and the element dissolves.

Applies to the owl ring, the coin chip, the hearts (whose outline is a true
2px dilation of the silhouette, not a shifted copy — a shifted copy leaves a
notch on the un-offset corner), toasts, and anything else added to the HUD.

**Test it in Emberwood and Sugarstorm before calling it done.** Those two are
the brightest and the darkest worlds; an element that reads in both reads
everywhere.

### 8.7 The scrim rule

Both existing themes hardcode `scrim: "#0000009e"` — pure black at 62%. Replace
with **`ink` `#1A1420` at 0.72**. Pure black behind a warm pixel-art world reads
as a hole punched in the screen; warm near-black reads as the world dimming.

---

## 9. Motion grammar

`DopamineFX` is already a strong library — 20 effects, consistent static API,
theme-aware. It does not need replacing. It needs **a timing law** so that
everything built on it feels like one hand made it.

### 9.1 The duration ladder

Five durations. Nothing in the game may use a sixth.

| Name | ms | Easing | Use |
| --- | --- | --- | --- |
| `snap` | 80 | `Power2` | hit reactions, button depress, hitstop |
| `pop` | 140 | `Back.easeOut(2.2)` | icon pops, correct answer, coin |
| `enter` | 260 | `Back.easeOut(1.7)` | any UI arriving |
| `exit` | 180 | `Back.easeIn(1.4)` | any UI leaving |
| `celebrate` | 700 | `Power2` | rewards, bursts, flourishes |

Exit is always faster than enter. Leaving should never make the player wait.

### 9.2 The squash-and-stretch law

Anything that lands, gets hit, or is collected deforms. Volume is preserved —
`scaleX × scaleY ≈ 1`.

| Event | Deform | Duration |
| --- | --- | --- |
| Land | `1.18 / 0.82` → overshoot `0.96 / 1.06` → settle | 80 + 120ms |
| Jump | `0.92 / 1.12` held during rise | — |
| Hit | `1.25 / 0.75` → settle | 80 + 100ms |
| Coin collect | `1.4 / 1.4` → 0 | 140ms |
| Button press | `0.94 / 0.94` | 60ms |

### 9.3 Hitstop

Freeze the whole scene for **60ms** on enemy defeat and **120ms** on player
damage. Two lines of code, and it is the single largest per-effort upgrade in
"game feel" available anywhere in this document.

### 9.4 Camera

| Event | Shake | Duration |
| --- | --- | --- |
| Enemy defeat | 0.003 | 120ms |
| Player damage | 0.006 | 200ms |
| Owl rescued | 0.004 | 180ms |
| Level complete | 0.008 | 300ms |
| Level up | 0.010 | 300ms |

**Hard ceiling 0.012.** `DopamineFX.levelUpBurst` currently runs 0.008 and is
fine; nothing may exceed the ceiling. Excessive shake reads as *malfunction* to
a young player, not as *impact*.

Additionally: **look-ahead**. Offset the camera 48px in the direction of travel,
lerped at 0.05. Free, and it makes the world feel like it is opening up ahead of
you rather than dragging behind.

### 9.5 Idle life

Nothing on screen is ever perfectly still. Every world ships with:
- 2–3 ambient particle types drifting on the `mid` layer
- 1 background creature that crosses the screen every 20–40s
- Foliage/machinery/signage with a 2–4s idle loop
- Collectibles bobbing 4px on a 1.6s sine, **phase-offset by index** so a row of
  coins ripples instead of pulsing in unison

That last detail — phase-offsetting a row of coins — is a two-line change and it
is the difference between a static level and a living one.

---

## 10. The dopamine economy

The brief asks to push on dopamine. The risk of pushing on dopamine is that
everything becomes loud, and when everything is loud, nothing is a reward. So it
is budgeted.

### 10.1 The reward tiers

| Tier | Frequency | Budget | Examples |
| --- | --- | --- | --- |
| **T0** micro | every 1–3s | ≤150ms · no camera move · ≤6 particles · sound ≤0.35 | coin ping, footstep dust, jump puff |
| **T1** small | every 10–20s | ≤400ms · no camera move · ≤12 particles · sound ≤0.5 | correct answer, enemy pop, checkpoint |
| **T2** medium | 2–4 per level | ≤900ms · shake ≤0.004 · ≤32 particles · colour wash allowed | owl rescued, streak ×3, ability granted |
| **T3** large | 1 per level | ≤1800ms · shake ≤0.008 · ≤64 particles · music sting | level complete, world unlocked |
| **T4** rare | ≤1 per session | ≤3000ms · full screen · may pause input | mastery-up, new world revealed, game complete |

**The spacing rule: never fire two effects above T1 within 600ms of each other.
Queue the second.** Two celebrations on top of each other is one celebration
that reads as a bug.

**The escalation rule: a tier may never be used for something a lower tier
covers.** The moment a coin gets a T2 celebration, an owl rescue stops feeling
like anything.

### 10.2 The streak — the highest-value new mechanic here

Consecutive correct answers within a level. This is the addiction loop, and it
is safe because **it only ever adds**.

| Streak | Reward |
| --- | --- |
| 1 | chime at base pitch |
| 2 | chime +1 semitone, scarf sparks begin |
| **3** | **T2:** `×2 COINS` toast, owl ring gains a flame ring, coin value doubles |
| 4 | chime +3, scarf trails continuously |
| **5** | **T2:** world-coloured aurora sweeps the screen, `ON FIRE!` toast, coins ×3 |
| 7+ | each answer showers 5 bonus coins from the top of the screen |

**Check the tiers against the content.** An owl serves `problemCount` problems,
so the maximum streak in a level is `owls x problemCount` — with the shipped
values (2 problems, 2-3 owls) that is 4 to 6. x2 at streak 3 is reachable
everywhere; x3 at streak 5 needs a three-owl level, and the two-owl tutorial
world can never reach it. Tracked in `roadmap.md`; do not treat these two
numbers as settled.

Reset **only on leaving the level**, never on a wrong answer. A wrong answer
*pauses* the streak — the flame dims to 40% and relights on the next correct
answer. Children will replay a level to protect a streak, and every replay is
more maths practice. That is the entire design.

### 10.3 The rescue moment — the T3 that matters most

This is what the game is named for. It gets the full treatment, identically in
every world:

1. Hörmann reaches the stuck owl. Camera eases in to 1.15× over 400ms.
2. The owl wriggles free. **60ms hitstop.**
3. World-coloured light bursts from the point of rescue, 32 particles.
4. The owl does one loop-the-loop and hoots — **the same hoot in all five
   worlds**.
5. The owl ring segment sweeps and pops.
6. Hörmann plays `celebrate` — wings up, crest flared, scarf fully extended.
7. `Owl saved!` toast. Camera eases back over 500ms.

Total: ~1600ms. Nothing else in the game is allowed to look like this.

### 10.4 Things deliberately excluded

An addictive game for a seven-year-old is not built the way an addictive game
for an adult is built. These are out, permanently:

- **No timers, no countdowns, no time pressure of any kind.**
- **No daily-login streak, no session-length reward, no "come back tomorrow".**
  The streak lives inside a level and dies with it.
- **No loss framing.** Nothing the child has earned is ever taken away.
- **No leaderboards or peer comparison.** The friends play the same game; they
  do not rank against each other.
- **No infinite scroll, no autoplay-next.** A level ends and the child is shown
  a stopping point.

Every one of these would work. None of them belongs in a product a parent
installs for a six-year-old, and shipping them would cost the trust that is the
actual business asset here.

---

## 11. Audio

Fifteen SFX exist, generated by `tools/gen_sfx.py`, and `roadmap.md` correctly
flags them as placeholders in tone. Direction for their replacement:

- **Instrument family: warm and organic.** Marimba, kalimba, plucked strings,
  soft woodblock. No synth stabs, no chiptune buzz, no orchestral hits.
- **Everything the player does resolves upward.** Coin, correct, jump, rescue:
  all rising intervals.
- **Nothing resolves downward except damage**, and even damage is a soft
  descending third, not a sting.
- **`wrong.wav` is not a failure sound.** It is a short, low, curious "hm" —
  the sound of a friend thinking, at 0.35 volume. It is currently at 0.45; drop
  it. It should be the quietest cue in the game.
- **The correct-answer chime is pitched by streak**, +1 semitone per step, cap
  +5. One parameter, enormous effect.
- **Music: one 8-bar motif, five arrangements.** The same melody, rearranged per
  world — flute in Emberwood, glass bells in Prism Hollow, brass and calliope in
  Sugarstorm, industrial percussion in Geyserworks, choir and strings in Aurora
  Spire. A returning melody is how a child knows this is all one place.
- **Ducking:** music drops to 0.55 during a maths challenge and restores over
  400ms. The problem is the loudest thing in the room while it is on screen.

---

## 12. Accessibility and child-safety

Not a checklist appendix — these are brand rules, because a game a child cannot
use is off-brand regardless of how it looks.

- **No information by colour alone.** Every colour-coded state carries a second
  channel: shape, icon, motion or position.
- **Colour-blind safe by construction.** The Fixed Nine were chosen so that
  `yes` / `notyet` / `hurt` separate on luminance as well as hue. Verify any new
  colour against deuteranopia and protanopia before it ships.
- **Everything reachable without reading.** Icons carry every essential meaning;
  text confirms it.
- **Full keyboard and gamepad navigation.** `UINavigator` exists and is used —
  every new interactive surface registers with it, with a visible `focus` ring.
- **Reduced-motion mode.** Honour `prefers-reduced-motion`: camera shake off,
  particle counts to 25%, screen flashes replaced with a border pulse. Effect
  *durations* stay the same so timing and audio sync do not break.
- **No flashing above 3Hz.** Full-screen flashes never exceed 0.4 alpha and
  never repeat within 1s. Photosensitivity is not negotiable.
- **Text never smaller than `label`/24px** for anything a child must read.
- **Every action is undoable or retryable.** There is no state in this game a
  child can enter and not get out of.

---

## 13. The on-brand test

Five questions. A screen that fails any of them is off-brand.

1. **Silhouette:** at 100% black, can you tell what is standable, what is
   collectable, and what will hurt you?
2. **Location:** from one frame with the HUD cropped out, can you name the
   world?
3. **Kindness:** is there anything on screen that would make a child feel bad
   about being wrong?
4. **Hierarchy:** is the single most important thing on screen also the biggest
   and brightest thing on screen?
5. **Consistency:** does every colour on screen appear in the Fixed Nine or in
   this world's token file?

### Off-brand, concretely

Pure black `#000000` · red on a maths answer · a countdown timer · text below
24px · a colour not in a token file · centred body text · an enemy with red
glowing eyes · a full-screen flash above 0.4 alpha · two T2+ effects inside
600ms · a wordmark spelled `HORMANN` · praise for being smart · anything shaped
like a worksheet.

---

## 14. Handoff

Ordered by value per hour of work. Items 1–5 are all small, and together they
change how the game feels more than anything else on the list.

### Tier 1 — hours each, disproportionate effect

**Landed.** Land squash, jump-launch anticipation and airborne stretch
(`Player.ts`); hitstop on enemy defeat and player damage (`DopamineFX.hitstop`);
camera look-ahead and the phase-offset collectible bob (`GameScene.ts`); the
warm scrim and the 900ms wrong-answer choreography in amber
(`MathChallengeScene.ts`, `MathBoard.ts`); and the full-screen red damage wash
replaced with an edge pulse that leaves the centre clear.

Two things from this tier were deliberately **not** done, and both are in
`roadmap.md` with the reason:

1. **Apex hang.** It changes gravity, and the vertical motion model is under a
   golden-fixture parity contract with the Godot port. It has to land in both
   runtimes at once.
2. **The board still covers the player.** §8.3 wants the camera panned before
   the scene pauses; header plus board plus a visible player does not fit in 540
   by stacking alone.

### Tier 2 — the systems this document is really about

6. **Ship the five world themes.** Drop [tokens/](./tokens/) into
   `public/data/themes/`, extend `DATA_PATHS` and `BootScene.registerThemes()`,
   and call `ThemeManager.setTheme(spec.theme)` on level load in `GameScene`.
   `HealthBar` already falls back to generated placeholders when a themed sprite
   key has no texture, so **this lands safely before any new art exists** — five
   visually distinct worlds from JSON alone.
7. **Unify the theme vocabulary.** `level-spec.schema.json` currently enums
   `theme` to `["forest","cave","village","mountain","sky","underwater"]`, which
   is a different vocabulary from `ThemeManager`'s ids. Replace it with the five
   world ids so *level spec theme = theme id = token filename*, one word
   throughout.
8. **Rebuild `HUDScene` to the three-pod layout.** §8.2.
9. **Implement the streak.** §10.2. Highest-value new mechanic in the document.
10. **Add the four new Muddle species** to `enemy_registry.json`. §3.3.

### Tier 3 — art production

11. Hörmann's scarf and the full animation set. §2.3, §2.4.
12. Five tilesets. Currently all six levels share `level1_tiles.png`.
13. Four new enemy sheets, five owl-station props, five door variants.
14. Five music arrangements of one motif; re-record the 15 SFX. §11.

### Naming

The five worlds are renames of shipped, translated level names. The strings,
their four bundle locations, the 240px fit budget and the measured widths for
both locales are in
[LEVEL_ART_BIBLE.md](./LEVEL_ART_BIBLE.md#renaming-the-levels). All ten fit;
the Icelandic names still want a native-speaker read.

### Open questions for the product owner

- **Level 3 and 4 are currently too small for their worlds.** `level_03` is 7
  platforms with zero hazards and zero enemies; `level_04` is 11 platforms with
  one of each. Sugarstorm and Geyserworks as specified need roughly 18–24
  platforms each. Grow the specs, or reassign those worlds to bigger levels.
- **`roadmap.md` asks whether unlocks should be strictly one-at-a-time.** The
  world ladder in the art bible assumes yes — sequential reveal is what makes a
  new world feel earned.
- **`pause.theme` promises a theme switcher that does not exist.** With five
  real themes it becomes worth building, but a child switching Aurora Spire's
  palette onto Emberwood breaks world identity. Recommendation: delete the key
  and let the level own its theme.
