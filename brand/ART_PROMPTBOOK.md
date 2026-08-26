# Hörmann — Art Promptbook

Status: Supportive
Authority: The runnable source of truth for generated cinematic art. Story canon and shot intent live in the series bible; brand law is `BRAND_SYSTEM.md`; the plate contract is `CINEMATIC_DIRECTION.md`.
Last verified against code: 2026-08-25

**This file is the config.** `tools/gen_art.mjs` parses the ` ```art ` blocks below and
calls the OpenAI image API; `tools/compose_plates.mjs` assembles the results into
the plates the game loads. Edit a prompt here, re-run, and only that image is
regenerated. There is no second copy of these prompts anywhere.

```bash
export OPENAI_API_KEY=sk-...

npm run art:plan       # what it would generate, and roughly what it costs. No key needed.
npm run art:gen        # generate everything stale or missing  ->  ai_assets/art/
npm run art:gen -- --only char.hormann.base
npm run art:compose    # cut, place, resize  ->  godot/assets/cinematics/prologue/
npm run validate:cinematics
```

Nothing regenerates unless its prompt changed. The runner stores a hash of the
exact prompt it sent beside every output, so re-running is free and safe.

---

## 1. Why this is built the way it is

The hard problem is not prompt quality. It is that **an image model cannot draw
the same crow twice.** Ask for Hörmann seven times and you get seven birds.

So characters are never prompted per shot. They are prompted **once**, approved
by eye, and then **placed as pixels** into every plate that needs them.

| Tier | What | How consistency is guaranteed |
| --- | --- | --- |
| 0 | **Style anchor** — one image that defines the look | Every later call passes it as a reference image |
| 1 | **Characters and props** — transparent PNG cut-outs | Generated once, then frozen. Every pose references the character's own base image |
| 2 | **Background plates** — one per shot, no characters in them | Style anchor as reference, plus the game's real screenshots where the plate has to match a level |
| 3 | **Compose** — background + frozen cut-outs + atmosphere | Plain compositing. Same pixels every time, so the crow cannot drift |

Four mechanisms, in descending order of how much they actually buy you:

1. **Characters are placed, not re-generated.** This is worth more than everything else combined.
2. **The style block is injected by the runner**, not copied into each prompt — so a human editing one prompt cannot accidentally drop it.
3. **Reference images** go up with every call via the edits endpoint.
4. **The palette is stated as hex** in the style block. Vague colour words drift; hex does not.

### The one thing to check by hand

**Approve Tier 1 before generating Tier 2.** Run `--only` on the character
blocks, look at them, re-roll the prompt until the crow is right — then never
touch it again. Every plate inherits whatever you accept here.

---

## 2. Resolution, and the honest limit

`gpt-image-1` outputs `1024x1024`, `1536x1024` or `1024x1536`. Nothing else.

Plates are `2048x1208` (see `CINEMATIC_DIRECTION.md` §4.2 — a 1920×1080 frame
plus a 64px camera bleed on all four sides). So every plate is generated at
`1536x1024` and upscaled **1.33×** by the compositor, with a light sharpen.

- On a painted plate with no fine detail this is invisible. On anything with
  texture or small marks it is not — which is another reason the style is flat
  shapes and hard edges rather than rendering.
- The wide Grubb plate is `2688x1208`, a **1.75×** upscale. It is the softest
  image in the film and it is also the one held furthest from the eye behind
  drifting dust. If it doesn't hold up, that plate is the first candidate for a
  human paint-over.
- If real resolution is wanted later, the fix is a dedicated upscaler or an
  artist pass on top of these — not a bigger prompt.

---

## 3. The story spine

Seven images, seven beats, one job each. This is the whole structure, and it is
deliberately the oldest shape there is.

| # | Beat | Feeling | The image |
| --- | --- | --- | --- |
| 1 | Something good exists | safe | Owls keeping the count at the Tally |
| 2 | It has one weak point | uneasy | One bead on a wire |
| 3 | Somebody breaks it on purpose | shock | A claw pushes the bead |
| 4 | Everything falls | loss | The Tally comes apart |
| 5 | Meet what did it | dread | Grubb, too big for the frame |
| 6 | Someone asks for help | hope | Vala's ring opens onto Earth |
| 7 | The help is you | commitment | A wing held out to the player |

If a shot can't say which row it is, it doesn't belong in the film.

---

## 4. The style block

Injected verbatim at the top of **every** prompt by `tools/gen_art.mjs`. It is
defined in this file and nowhere else — edit it here and the whole film changes
together.

```style
Children's storybook illustration for a video game for five to eight year olds.
Flat painted shapes with clean hard edges. Bold, instantly readable silhouettes.
Limited palette with strong value contrast. Warm, hand-made, slightly rough
brush character. Cinematic wide composition with a clear focal point.
Absolutely not: photorealism, 3D render, plastic shading, airbrush gradients,
lens flare, bloom, motion blur, chromatic aberration, anime, chibi, cute
mascot styling.
Never frightening for a small child: no blood, no gore, no skulls, no bared
teeth at the camera, no glowing red eyes, nothing lunging toward the viewer.
No text, no letters, no numbers, no words, no signage copy, no watermark, no
signature, no border, no frame, no UI elements, no user interface.
```

### Palette

Stated as hex in each prompt that needs it, because colour words drift and hex
doesn't. These are `BRAND_SYSTEM.md` §6.

```palette
ink       #1A1420   outlines, deep shadow
paper     #FFF8E7   highlight, light
coin      #FFC93C   a thing counted correctly, glowing
owl       #FFE9A8   owl feathers, warm interior light
hero      #E23B3B   Hörmann's face mask and scarf. The only red in the film.
spire     #3A6EA8 with #A97BFF aurora and #1B223E night sky   (shots 1-4)
hollow    #2B2A5E with #4DE3FF glints on #16142E gloom        (shot 5)
ember     #3F8F5B ground under a #F6C092 peach dawn           (shots 6-7)
roach     #6B3F16 rust-brown carapace, #8A7A2E grimy plating
```

---

## 5. Tier 0 — the anchor

**Generate this one first.** It is the establishing shot of the film *and* the
style reference every later call passes up, so a bad anchor poisons everything
and a good one carries it. Look hard at it before going further.

```art
id: bg.tally
kind: plate
size: 1536x1024
refs: []
---
Wide night shot of a tall wooden tower of counted things — stacked abacus
frames, wires and beads — standing on a cold mountaintop, seen from slightly
above and far away, small in a huge sky. Aurora ribbons #A97BFF and #7CF5C4
across a #1B223E night sky. Mountains #3A6EA8 below. Warm #FFC93C and #FFE9A8
points of light all through the tower's frame.
A dark foreground ridge with a low wooden rail across the bottom quarter of the
frame. Empty: no people, no birds, no creatures anywhere.
Three clean depth planes. Cold outside, warm inside.
```

---

## 6. Tier 1 — characters and props

Transparent background, no scenery, no ground shadow. These become PNG cut-outs.

**Hörmann's base is anchored to the game's real sprite**, which is passed as a
reference: a dark corvid with a scarlet face-mask and a raised crest. The
generated character must be a painted enlargement of that bird, not a new one.

```art
id: char.hormann.base
kind: character
size: 1024x1024
background: transparent
refs: [bg.tally, ref:godot/assets/sprites/characters/crow2/crow3/crow1-64px-fixed.png]
---
Full-body character design of a small scrappy crow, facing three-quarters to the
left, standing, wings folded, alert and curious. Painted enlargement of the
supplied pixel sprite — match it exactly: charcoal-black feathers with cool
blue-grey highlights, a bright scarlet #E23B3B mask of feathers across the face
around the eye, a pale grey beak, and a raised crest of three asymmetric
feathers, tallest at the front.
He wears a long scarlet #E23B3B knitted flight-scarf that trails behind him.
Scrappy and brave, a bit punk. Not cute, not a mascot, not grim.
Transparent background. No ground, no shadow, no scenery.
```

```art
id: char.hormann.ask
kind: character
size: 1024x1024
background: transparent
refs: [char.hormann.base]
---
The same crow, now facing the viewer directly and holding one wing out toward
the camera — an offered hand, an invitation. Head slightly tilted, hopeful and
a little uncertain. Standing. The other wing folded. The scarlet scarf hangs
still.
Identical bird to the reference in every detail: same feather colours, same
scarlet face mask, same three-feather crest, same scarf.
The outstretched wing is the clearest shape in the image and reads as a
gesture, not as flight. Transparent background, no shadow, no scenery.
```


```art
id: char.hormann.railing
kind: character
size: 1024x1024
background: transparent
refs: [char.hormann.base]
---
The same crow in full profile facing left, hunched small against rain, feathers
slightly wet and flattened, standing on a short section of plain wet grey metal
railing. Ordinary, unremarkable, a bit cold — a city bird on a wet morning.
NO scarf in this image: this is the bird before he was given one.
Identical bird to the reference otherwise. Transparent background, nothing but
the crow and the short piece of railing under his feet.
```

```art
id: char.vala.base
kind: character
size: 1024x1024
background: transparent
refs: [bg.tally]
---
Full-body character design of a very small owl, facing three-quarters right,
standing. Deliberately the opposite of a crow: round, soft-edged, symmetrical,
pale cream and warm buff feathers #FFE9A8 with #1A1420 outlines, enormous calm
dark eyes, a tiny beak, no teeth, no talons showing.
She is small and slightly scruffy and clearly not powerful — the least
impressive owl anyone ever sent for help — and she is completely determined.
She wears round wire spectacles and a short knitted scarf.
Transparent background. No ground, no shadow, no scenery.
```

```art
id: char.vala.ring
kind: character
size: 1024x1024
background: transparent
refs: [char.vala.base]
---
The same small owl in profile facing right, one wing raised and extended
upward and forward, in the act of drawing a circle in the air. Concentrating
hard. A faint warm #FFC93C trail of light follows the wingtip along the arc she
has drawn so far — an incomplete circle, not yet closed.
Identical owl to the reference in every detail. Transparent background, no
scenery, no shadow.
```

```art
id: char.vala.behind
kind: character
size: 1024x1024
background: transparent
refs: [char.vala.base]
---
The same small owl, seen small and three-quarters from behind and to one side,
perched calmly and looking toward the viewer. Quiet, watchful, hopeful.
Identical owl to the reference in every detail. Transparent background, no
perch, no shadow, no scenery.
```

```art
id: char.owl.stuck
kind: character
size: 1024x1024
background: transparent
refs: [char.vala.base]
---
A different owl of the same species and style as the reference — larger, older,
rounder, no spectacles. She is wedged and cannot move: loops of dull grey wire
are wound around the branch and the perch she sits on, crossing in front of her
body, pinning her in place. She holds a small glowing #FFC93C wooden bead
carefully in one claw.
Her expression is calm and extremely annoyed. NOT frightened, NOT sad, NOT
hurt, not crying, no injury. A professional who has been stuck here for a while
and is thoroughly fed up.
The wire is around the perch and across her, never around her neck. Transparent
background, no scenery beyond the short branch and the wire.
```

```art
id: char.grubb.back
kind: character
size: 1536x1024
background: transparent
refs: [bg.tally]
---
An enormous cockroach seen from behind and to one side, so close and so large
that the body runs off both the left and the right edge of the frame and is
never fully visible. Only a segment of him fits: a broad plated back of
mismatched rust-brown #6B3F16 and grimy olive #8A7A2E armour segments, no two
the same shade, dented and scratched.
Bolted across the visible shoulders like a chest-plate is a stolen wooden
counting frame — an abacus — with every bead shoved hard to one side.
Tied under the far edge, at the neck, is a small pale cream #FFE9A8 knitted
scarf, absurdly too small for him, worn like a napkin or a bib.
At the extreme right edge of the frame, mostly cut off, one enormous yellow
#FFC93C eye with a brass monocle over it. One antenna crosses the top of the
frame, bent at a sharp right angle and splinted with a twig and tape.
Pompous, greedy, enormous, and slightly ridiculous. NOT scary: no bared teeth,
no red eyes, no mandibles toward the viewer, nothing lunging. He is not looking
at us.
Transparent background, no ground, no scenery.
```

```art
id: char.grubb.claw
kind: character
size: 1024x1024
background: transparent
refs: [char.grubb.back]
---
A single enormous cockroach claw and forelimb entering from the right edge of
the frame, reaching left and slightly down, one segmented tip extended to push
something small. Same rust-brown #6B3F16 and grimy olive #8A7A2E plating as the
reference, dented, with one chipped edge.
Deliberate and unhurried — the gesture of somebody flicking a switch they know
they are not allowed to touch. Nothing else of the creature is visible.
Transparent background, no scenery, no shadow.
```


```art
id: prop.barge
kind: character
size: 1536x1024
background: transparent
refs: [char.grubb.back]
---
An enormous ugly flying barge, seen from below and to one side, filling most of
the frame and running off the edges. Not sleek and not military: a slow
lopsided hulk welded together out of stolen counting equipment — wooden abacus
frames as hull plating, a stone milestone as a keel, a signpost bolted on as a
fin, wires and beads strung along the flanks.
Rust-brown #6B3F16 and grimy olive #8A7A2E, nothing matching, nothing painted,
smoke trailing from three mismatched stacks. A few small warm #FFC93C lights in
its underside.
Menacing because of its size and how slowly it clearly moves. Transparent
background, no sky, no clouds.
```

```art
id: prop.bead
kind: character
size: 1536x1024
background: transparent
refs: [bg.tally]
---
Extreme close-up of a single round wooden bead on a taut horizontal wire, in
profile, filling about a third of the frame. The bead is polished warm wood and
glows softly from inside with #FFC93C light. Two or three more beads are
visible further along the wire, out of focus and much dimmer.
Simple, calm, precise. The most important small object in a story. Transparent
background, no scenery.
```

```art
id: prop.ring
kind: character
size: 1024x1024
background: transparent
refs: [bg.tally]
---
A circular portal hanging in the air, edge-on to slightly three-quarter, about
two-thirds the height of the frame. The rim is a ring of warm #FFC93C light,
brightest where it was drawn last, slightly uneven and hand-drawn rather than
perfectly geometric.
The interior of the circle is empty and fully transparent — a hole, not a
picture. Only the glowing rim exists.
Transparent background, nothing else in the frame.
```

---

## 7. Tier 2 — background plates

No characters, no props. Those get composited in. Each plate is the *place*.


```art
id: bg.bead
kind: plate
size: 1536x1024
refs: [bg.tally]
---
Extreme close-up interior of the wooden counting tower at night, shallow and
almost abstract: a wall of vertical wires and wooden frames receding into warm
#1A1420 shadow, lit from within by soft #FFC93C light. Warm wood, cool shadow.
Completely empty of beads in the centre third of the frame, which is left as
plain out-of-focus dark wood — something will be placed there.
No creatures, no birds, nothing sharp. Quiet and still.
```

```art
id: bg.claw
kind: plate
size: 1536x1024
refs: [bg.bead]
---
The same close-up interior of the wooden counting tower as the reference, but
darker and emptier: a taut horizontal wire crossing the frame, warm wood
receding into deep #1A1420 shadow on the right side of the frame, where the
darkness is almost total. The left two thirds are dimly lit warm wood.
The right third of the frame is nearly black and completely empty — something
will come out of it.
No creatures, no birds, no beads.
```

```art
id: bg.miscount
kind: plate
size: 1536x1024
refs: [bg.tally]
---
The wooden counting tower from the reference, now collapsing — not exploding. A
tall stack coming apart the way a pile of counted things goes when the bottom
one is wrong: frames sliding off each other, wires snapping loose, wooden beads
scattering outward in slow arcs. Five bright #FFC93C points of light breaking
away and streaking out toward the edges of the frame in five directions.
Aurora #A97BFF sky #1B223E behind, mountains #3A6EA8 below.
Sad and enormous rather than violent. No fire, no smoke, no explosion, no
debris cloud. No creatures, no birds.
```

```art
id: bg.shed
kind: plate
size: 1536x1024
refs: [bg.tally]
---
Wide interior of a vast dim underground shed or larder, receding to the right.
Violet-dark #16142E gloom, walls of dull #2B2A5E crystal with cold #4DE3FF
glints. Rough wooden shelving along the walls holding hundreds of small dull
grey lumps in rows — a stock of something, stored and catalogued, going back
further than the eye can follow.
On the far right, a tall gantry window with a pale sky beyond it.
Cavernous and industrial and old. Completely empty of creatures — no
cockroaches, no birds, no insects, nothing alive. The middle and lower half of
the frame is open floor and clear, unobstructed space.
```

```art
id: bg.ledge
kind: plate
size: 1536x1024
refs: [bg.tally, bg.miscount]
---
Wide shot of a broken stone ledge high on a cold mountainside at dawn, the
wreckage of the wooden counting tower behind and below it — snapped frames and
loose wire, dark and dead, no glow left anywhere in it.
Pale cold #3A6EA8 sky going to a thin #F6C092 line at the horizon. Enormous
empty space on the right two-thirds of the frame, open sky, nothing in it.
Lonely and very large. One small creature will be placed on the ledge at the
left. No creatures, no birds in the plate itself.
```

```art
id: bg.street
kind: plate
size: 1024x1024
refs: []
---
An ordinary grey city street on a wet morning, seen straight on and close: wet
tarmac, a puddle, the base of a lamp post, a scuffed kerb, plain wet grey metal
railing running across the middle of the frame. Overcast flat light, no sun, no
colour saturation anywhere — cool greys, dull browns, one dull green.
Deliberately flat, ordinary and unremarkable — the opposite of a fantasy
illustration. Same flat painted technique and hard edges as the rest of this
set, but drained of warmth.
No people, no birds, no animals, no cars, no text, no shop signs, no readable
lettering anywhere.
```

```art
id: bg.emberwood
kind: plate
size: 1536x1024
refs: [bg.tally, ref:design-concept/plate-emberwood.png]
---
Wide shot of a warm forest clearing at dawn, in the palette of the supplied
game screenshot — match its colours closely: peach #F6C092 dawn sky, green
#3F8F5B grassy ground across the bottom third, deep green foliage, warm
#FFD98A light.
A single bare low branch enters from the left at about one third of the way up
the frame, thick enough to stand on, and is clear and empty along its length.
Soft layered trees behind. Bright, friendly, inviting, the beginning of an
adventure.
The lower left area is open and uncluttered — a small creature will be placed
standing on the branch. No creatures, no birds in the plate itself.
```

### Foreground atmosphere layers

Thin, mostly-empty transparent overlays that drift in front of everything. They
are what make a still image feel like a place.

```art
id: fx.aurora
kind: character
size: 1536x1024
background: transparent
refs: [bg.tally]
---
Thin sparse ribbons of aurora light, #A97BFF and #7CF5C4, sweeping diagonally
across an otherwise completely empty transparent frame. Soft flat translucent
bands, not glowing gas, not photographic. Around fifteen percent coverage — the
frame is mostly empty. Nothing else at all.
```

```art
id: fx.dust
kind: character
size: 1536x1024
background: transparent
refs: []
---
Sparse floating dust motes and small drifting flecks of grit, pale #FFF8E7 and
dull #8A7A2E, scattered unevenly across an otherwise completely empty
transparent frame. Flat painted dots and short dashes of varying size, larger
and softer toward the bottom of the frame. Around eight percent coverage.
Nothing else at all.
```

```art
id: fx.leaves
kind: character
size: 1536x1024
background: transparent
refs: [bg.tally]
---
A sparse scatter of individual forest leaves, deep green #2C6B42 and warm
#3F8F5B, of varied size and angle, across an otherwise completely empty
transparent frame. Flat painted shapes with hard edges, largest and darkest at
the top and bottom edges of the frame, as though very close to the camera.
The centre of the frame is empty. Around twelve percent coverage. No branches,
no trees, no creatures.
```

---

## 8. Tier 3 — compose

`tools/compose_plates.mjs` reads these, cuts the transparent assets to their
content bounds, scales and places them, and writes the layered plates the game
loads. `x`/`y` are fractions of the plate; `w` is the placed width as a fraction
of plate width; `anchor` is which point of the asset those coordinates name.

```compose
plate: 01_tally
size: 2048x1208
layers:
  - out: 01_tally_sky.png    from: bg.tally     fit: cover
  - out: 01_tally_spire.png  from: fx.aurora    fit: cover
  - out: 01_tally_rail.png   from: char.vala.behind  w: 0.06  x: 0.34  y: 0.78  anchor: bottom
```

```compose
plate: 02_bead
size: 2048x1208
layers:
  - out: 02_bead_wire.png  from: bg.bead   fit: cover
  - out: 02_bead_wing.png  from: prop.bead  w: 0.42  x: 0.50  y: 0.50  anchor: center
```

```compose
plate: 03_claw
size: 2048x1208
layers:
  - out: 03_claw.png  from: bg.claw  fit: cover
    over:
      - from: prop.bead        w: 0.20  x: 0.42  y: 0.52  anchor: center
      - from: char.grubb.claw  w: 0.55  x: 0.98  y: 0.50  anchor: right
```

```compose
plate: 04_fall
size: 2048x1208
layers:
  - out: 04_fall_sky.png     from: bg.miscount  fit: cover
  - out: 04_fall_tally.png   from: fx.aurora    fit: cover
  - out: 04_fall_lights.png  from: fx.dust      fit: cover
```

```compose
plate: 05_grubb
size: 2688x1208
layers:
  - out: 05_grubb_gloom.png  from: bg.shed  fit: cover
    over:
      - from: prop.barge  w: 0.26  x: 0.90  y: 0.30  anchor: center
  - out: 05_grubb_body.png   from: char.grubb.back  w: 0.78  x: 0.34  y: 0.62  anchor: center
    with:
      - from: char.owl.stuck  w: 0.11  x: 0.87  y: 0.72  anchor: center
  - out: 05_grubb_dust.png   from: fx.dust  fit: cover
```

```compose
plate: 06_call
size: 2048x1208
layers:
  - out: 06_stuck_forest.png  from: bg.ledge  fit: cover
  - out: 06_stuck_owl.png     from: char.vala.ring  w: 0.10  x: 0.18  y: 0.66  anchor: bottom
    with:
      - from: prop.ring   w: 0.30  x: 0.58  y: 0.52  anchor: center
      - from: bg.street            w: 0.26  x: 0.58  y: 0.52  anchor: center  mask: circle  behind: true
      - from: char.hormann.railing  w: 0.09  x: 0.58  y: 0.57  anchor: bottom
  - out: 06_stuck_leaves.png  from: fx.dust  fit: cover
```

```compose
plate: 07_ask
size: 2048x1478
layers:
  - out: 07_hero_sky.png     from: bg.emberwood  fit: cover
  - out: 07_hero_canopy.png  from: fx.leaves     fit: cover
  - out: 07_hero_crow.png    from: char.hormann.ask  w: 0.16  x: 0.34  y: 0.74  anchor: bottom
    with:
      - from: char.vala.behind  w: 0.07  x: 0.45  y: 0.70  anchor: bottom
```

`07_ask` is `2048x1478` — taller than the rest — because the shot data still
carries the old tilt-up, which needs headroom above the frame. **When the Ask
replaces it, that plate becomes `2048x1208` with no camera move**, since a shot
that waits for a child does not pan. `npm run validate:cinematics` fails if this
size and the shot data ever disagree, which is how the mismatch gets noticed
rather than shipped.

**The Ask plate's placement is provisional and must be checked against a real
screenshot.** `CINEMATIC_DIRECTION.md` §6 requires the painted crow to sit
exactly where the sprite spawns so the match cut lands. Capture level 1's first
frame at 960×540 with the HUD off, drop it under the composed plate, and correct
`x`/`y`/`w` here until the two crows overlap. That is the one number in this
file that cannot be reasoned out — it has to be measured.

---

## 9. Cost, limits and gotchas

- **~30 images.** At the time of writing that is single-digit dollars at medium
  quality and roughly triple at high. `npm run art:plan` prints its own
  estimate from the rates in `tools/gen_art.mjs` — check those against current
  OpenAI pricing before trusting the number.
- **Generate Tier 0 and 1 at `high`, plates at `medium`.** The characters are
  reused in every shot and get looked at; a background behind drifting dust
  does not repay the money.
- **The model will add things you did not ask for** — a bird in an empty sky, a
  creature on an empty branch. Every plate prompt above says *no creatures* for
  that reason. If one appears anyway, re-run that block; it is cheap.
- **Text is the other recurring failure.** The style block bans it three ways
  and it will still occasionally appear. Any plate with a letter in it is a
  reject, because a child who can't read must never see fake words.
- **Transparent backgrounds need `png` or `webp`.** The runner enforces this.
- **Nothing here is a sprite.** These are painted plates and they are exempt
  from the pixel law by `CINEMATIC_DIRECTION.md` §4.2. Do not generate gameplay
  sprites, tiles or UI with this pipeline — `ASSET_MANIFEST.md` owns those and
  they are hand-drawn.
- **Composed plates are palette PNG, not truecolour.** A painted 2048×1208 plate
  is 1–2 MB as truecolour and §4.3 caps a plate at 400 KB, so the compositor
  quantises to 256 colours. That is nearly lossless for flat shapes in a limited
  palette — the art direction and the byte budget happen to want the same thing.
  If a plate still busts the cap, drop a layer rather than raising the budget.
- **Commit `ai_assets/art/`.** It reads like staging, and `ASSET_SPECS.md` does
  define that folder as staging — but these particular files are the source of
  the film's consistency. Lose them and the next `art:gen` produces a *different
  crow*, and every plate has to be recomposed around him. They are expensive and
  irreplaceable; treat them as art, not as cache.
- **Only the composed plates under `godot/assets/cinematics/` are live**, and
  running `art:compose` overwrites whatever is there — including the deliberate
  placeholders from `tools/gen_placeholder_cinematic.mjs`. With no generated art
  present it writes nothing and lists what is missing, so the placeholders
  survive until there is something better to put over them.
