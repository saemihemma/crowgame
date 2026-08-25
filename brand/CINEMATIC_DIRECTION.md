# Hörmann — Cinematic Direction

Status: Supportive
Authority: Cinematic art direction, the prologue shot list, and the authoring pipeline contract. Brand law is `BRAND_SYSTEM.md`; story canon is `STORY_BIBLE.md`; runtime truth is `godot/**`.
Last verified against code: 2026-08-25

The opening cinematic, how it is directed, how it is authored, how it is
validated, and how it becomes the profile-creation screen without a cut.

Story canon: [STORY_BIBLE.md](./STORY_BIBLE.md). Brand law:
[BRAND_SYSTEM.md](./BRAND_SYSTEM.md). Nothing here overrides either.

---

## 0. The form, and why this form

**Stills, moved.** Painted plates, a slow camera, crossfades, and two or three
layers per shot drifting at different rates. No character animation, no lip
sync, no video file.

This is not a compromise. For this product it is the correct medium, on four
counts:

1. **It is the only cinematic form a browser build can afford.** The payload is
   served `immutable` from a static host and the boot funnel is already the
   riskiest thing in the product (`crow-errors.js` reports `boot_start`, and
   `boot.gd` reports `boot_ready`, precisely because of it). Seven plates under
   a hard byte cap is a cost we can measure. A video file is not.
2. **It scales down to placeholders and up to real art with no code change.**
   The pipeline runs today on generated placeholder plates, so the flow, timing,
   captions and handoff can be judged before anyone paints anything —
   `PRODUCTION_PLAN.md` Decision 3 says the user draws the art, and this keeps
   that promise without blocking on it.
3. **A slow pan is how you show something too big for the frame.** Which is
   exactly the antagonist's design constraint (`STORY_BIBLE.md §5.1`): Grubb is
   never fully in shot, so the camera moving and *not reaching the end of him*
   is the whole performance. Animation could not do it better and would cost
   fifty times more.
4. **A held still is the cheapest shock in cinema.** Shot 3 — the claw pushing
   the bead — is one static frame and one wooden click, and it is the most
   important moment in the film.

---

## 1. The rules of the film

Six, and they are not negotiable.

1. **Comprehensible muted and unread.** `STORY_BIBLE.md §7` is the gate: sound
   off, captions ignored, a five-year-old can still say what happened. Test it
   that way or the shot is not finished.
2. **Never frightening.** `BRAND_SYSTEM.md §3.1` in full. No lunge at camera, no
   screen-filling reveal, no face for Grubb, ever. Nothing exceeds 0.4 alpha on
   a full-screen flash and nothing flashes twice within a second (`§12`).
3. **Skippable from the first frame.** Not after a delay, not after a logo. A
   parent who has seen it and a child who does not want it both get out
   immediately, by touching the screen.
4. **It never blocks play.** Any failure — a missing plate, a decode error, a
   slow device — routes straight to profile creation. A cinematic that can stop
   a child from reaching the game is a defect, not a cinematic.
5. **It ends in the UI, not in black.** §5. The last shot becomes the sky behind
   the name field. There is no cut between the film and the game.
6. **Under a minute.** The current cut is 38 seconds of held frames. The
   validator caps the format at 60. A six-year-old's patience is the budget.

---

## 2. The prologue — shot list

Seven shots: 38.0s of holds plus 6.3s of crossfades, **44.3s** end to end, as
reported by `npm run validate:cinematics`. Every caption
is one line, ≤8 words (`BRAND_SYSTEM.md §4.2`), optional, and never the only
carrier of a fact (`STORY_BIBLE.md §7`).

Move notation is a source-image rectangle: the camera starts on `from` and ends
on `to`. Rectangles are in plate pixels and are 16:9, always. **A held shot is a
move of zero length** -- `from` and `to` are the same rect -- so neither the
runtime nor the validator carries a second case for stillness.

---

### 1 · THE TALLY — 6.0s

> *Caption:* **"The owls kept the count."**

Aurora Spire at night. The Tally: a tower of counted things, warm points of
light all through it (`STORY_BIBLE.md §2` — counted things glow), owls in
silhouette around it, aurora behind. Cold indigo world, warm interior — the
palette contrast the whole film is built on.

- **Move:** slow push in, ~1.10×, centred. The film opens by *arriving*.
- **Layers:** aurora sky (drifts left, 4px) · the Spire and Tally (still) ·
  foreground rail with two owl silhouettes (still).
- **Audio:** `level_05_music` starts here. The Spire's own theme opens the film
  and the game ends there — the music tells the child where this is going
  before any image does.
- **Transition out:** cross fade, 900ms.

### 2 · THE BEAD — 5.0s

> *Caption:* **"One bead held it all."**

Macro. One bead on a wire, filling a third of the frame. An owl's wing at the
edge, out of focus, resting. The bead glows.

- **Move:** slow drift right, no zoom. Nothing is happening yet, and the shot
  should feel like nothing is happening yet.
- **Layers:** wire and beads (still) · owl wing (drifts 2px, breathing).
- **Transition out:** cross fade, 900ms.

### 3 · THE CLAW — 3.0s · **held**

> *Caption:* none. Deliberately.

From the dark at the edge of frame, a claw. It pushes the bead one place.

- **Move:** none. The only static shot in the film. Everything before it has
  been moving, so stopping *is* the shock — and it needs no words in any
  language, which is the point.
- **Layers:** one plate. Do not layer this shot; a parallax drift would soften
  the stillness that is doing all the work.
- **Audio:** one wooden click, on the push, at 1.4s. `answer_wrong` is the
  nearest live SFX slot and it is close enough to ship on; the intended sound is
  a single bead of wood against wood, dry, quiet, and slightly too satisfied.
- **Transition out:** cross fade, 900ms. *(Not a hard cut. A cut here reads as
  violence; the fade reads as consequence.)*

### 4 · THE MISCOUNT — 5.5s

> *Caption:* **"Then the count fell."**

The Tally coming apart. Not an explosion — a **collapse**, the way a stack of
counted things goes when the bottom one is wrong. Five lights break off and
leave the frame in five directions.

- **Move:** pull back, 1.15× → 1.00×. The one big move in the film. Pulling
  *out* rather than pushing in, because the story is things flying apart.
- **Layers:** sky (still) · the falling Tally (still) · the five lights, drifting
  outward.
- **Reduced motion:** this is the shot that most needs the pan disabled cleanly.
  Held on the `to` rect, the collapse still reads.
- **Transition out:** cross fade, 900ms.

### 5 · HIS IMMENSITY — 7.0s · **the longest shot in the film**

> *Caption:* **"Grubb eats what does not add up."**

Grubb. Partial, and never more than partial (`STORY_BIBLE.md §5.1`): a segment
of rust-plated back, the abacus chestplate with every bead shoved to one side,
one enormous yellow eye at the very edge of frame with a monocle on it, and
**the bib** — a stolen owl's knitted scarf, far too small, tied under his chin.

- **Move:** slow lateral pan, left to right, no zoom, across the widest plate in
  the film. **He does not end.** The pan runs out of screen before it runs out
  of him. This is the only shot whose plate is wider than 16:9 in spirit — frame
  the `from` and `to` rects at opposite ends of a plate that has more Grubb in it
  than either rect contains.
- **Layers:** larder gloom behind (still) · Grubb (still) · a slow drift of dust
  in front, 3px. Dust in front of him sells the scale more than anything on him.
- **Audio:** the wrong count begins here — *"one… one… one…"*, slow, wet,
  satisfied, ceiling 0.5 (`§3.1`). It is the first time the child hears him and
  they will recognise it under the Geyserworks track in world 4.
- **Never:** a full body, a head-on face, a lunge, red in the eye. If a draft
  plate shows all of him, the plate is wrong.
- **Transition out:** cross fade, 900ms.

### 6 · STUCK — 5.5s

> *Caption:* **"Now the owls are stuck."**

Emberwood, dawn. An owl wedged in a split trunk, calm, holding her number,
which glows. One chain link across the perch (`BRAND_SYSTEM.md §3.4a` — across
the perch, never around the owl). She is not distressed. She has been here a
while and she is a professional.

- **Move:** slow tilt up, no zoom, ending on her face.
- **Layers:** forest depth (drifts 3px) · trunk and owl (still) · foreground
  leaves (drift 5px, the closest thing to camera in the film).
- **Audio:** `level_01_music` cross-fades in here. The world the child is about
  to start in announces itself.
- **Transition out:** cross fade, 900ms.

### 7 · HÖRMANN — 6.0s · **the handoff**

> *Caption:* **"He cannot count. You can."**

The crow. Small in frame, on a branch, scarlet scarf streaming (`§2.3`). He
looks up, and he goes — and the camera follows him up until the frame is nothing
but dawn sky.

- **Move:** tilt up, 1.05× push, ending on empty sky at the top of the plate.
- **Layers:** sky (still) · canopy (drifts 4px) · Hörmann (still — he is a
  silhouette leaving, and the camera move does the leaving).
- **Caption timing:** this caption lands *late*, at 3.2s, after he has gone. The
  line is the handoff to the player and it should arrive on an empty sky.
- **Transition out:** fade to the live `ScreenBackdrop`. Not to black. §5.

---

## 3. The grammar

### 3.1 One new duration, and no more

`BRAND_SYSTEM.md §9.1` says five durations and "nothing in the game may use a
sixth". A cinematic cannot run on 700ms as its longest beat, so this document
**adds exactly one** named duration and nothing else:

| Name | ms | Easing | Use |
| --- | --- | --- | --- |
| `cine_fade` | **900** | linear | every transition between shots |

Everything else in the film reuses the existing ladder: captions arrive on
`enter` (260, `Back.easeOut(1.7)`) and leave on `exit` (180). Shot holds are
content, not motion — 3.0–7.0s, set per shot in the data.

The amendment is deliberate and bounded. If a second cinematic duration is ever
proposed, it belongs in `BRAND_SYSTEM.md §9.1` after an argument, not here.

### 3.2 The camera

- **One move per shot. Never two.** A pan *and* a zoom in the same shot reads as
  a slideshow effect rather than a camera. Six of the seven shots move; five of
  those move on one axis only.
- **Slow.** The whole film's fastest move is shot 4's pull-back, and it covers
  15% of the frame in 5.5 seconds. If a move is noticeable *as* a move, it is
  too fast.
- **Zoom range 1.00×–1.15× of the authored plate.** Never beyond 1.15. §4.2
  explains why in terms of pixels.
- **The frame never leaves the plate.** Enforced arithmetically by the validator
  (§6.2), because this is the one bug this kind of system always ships: a pan
  that runs 4px off the edge of the still and shows the clear colour for half a
  second.
- **Every plate carries a 64px camera bleed** on all four sides, and no rect
  enters it. Not belt-and-braces: a layer at `parallax` 0.8 lags the frame and a
  layer with 4px of drift wanders, so a frame flush to the plate edge puts
  *those* off the plate even when the frame itself is fine. The first draft of
  this film had rects flush to the edge on four of seven shots and the validator
  rejected all four -- which is the whole argument for writing the validator
  before the art.

### 3.3 Layers and drift

Two or three layers per shot, back to front. Each layer carries:

- **`parallax`** — how much of the camera move it takes. `1.0` moves exactly
  with the frame; `0.85` lags and reads as further away. Back layers get less,
  never more.
- **`drift`** — a slow sine loop, 2–5px, phase-offset per layer index so two
  layers never breathe in unison. This is `BRAND_SYSTEM.md §9.5` ("nothing on
  screen is ever perfectly still") applied to a still image, and it is the
  single difference between "a photo with a pan on it" and "a place".

Ceiling: **5px of drift.** Above that it stops reading as air and starts reading
as a sprite sliding.

### 3.4 Captions

- One line, ≤8 words, in the caption band across the bottom sixth of the frame.
- **On a scrim** (`§8.7`), because a caption must carry its own contrast rather
  than borrow it from whichever plate is behind it — this is exactly the mistake
  `§8.6b` exists to record.
- **28px**, above the 24px floor (`§12`), because a parent is reading this aloud
  across a tablet.
- In at 400ms into the hold, out 400ms before it ends. A caption never crosses a
  transition; a caption that is still on screen while the image changes reads as
  belonging to the wrong shot.
- **Both locales, always.** `tools/validate_i18n.mjs` enforces en/is lockstep and
  a Latin-1 glyph allowlist; the validator in §6 additionally fails a cinematic
  whose caption key is missing from either bundle, so the film can never ship
  half-translated.

### 3.5 Audio

- **Music runs across the film, not per shot.** Two cues only: `level_05_music`
  from shot 1, `level_01_music` cross-fading in at shot 6. The Spire opens it
  and Emberwood receives it.
- **Three sound events, all optional.** The bead click (shot 3), the wrong count
  (shot 5), one hoot (shot 6). `ASSET_SPECS.md` notes the manifest is music-only
  in places and SFX can degrade silently — the film is designed to be *correct*
  in silence, so a missing SFX is a lost flourish and never a lost fact.
- Nothing in the film exceeds 0.5 volume (`§3.1`).

---

## 4. The art contract

### 4.1 What to draw

Seven shots, 18 plates, 102 KB as placeholders. Full list, sizes and destinations are in
[ASSET_MANIFEST.md](./ASSET_MANIFEST.md) under **Priority 6 — the prologue**;
that file is the production list, this one is the direction.

Placeholders for all 17 exist today (`node tools/gen_placeholder_cinematic.mjs`),
so the film runs, the timing can be judged, and each plate can be replaced one at
a time by dropping a PNG over it. No code change, no data change.

### 4.2 The pixel law, and the one exemption in this product

`BRAND_SYSTEM.md §5.1` puts all sprite work on a 1px grid at authored size and
forbids non-integer scaling. **Cinematic plates are exempt.** Stated plainly so
it is a decision and not a drift:

- They are **painted plates, not sprites.** They never sit in a frame beside a
  sprite, never scale a tileset, and never tile — so the seam and shimmer
  failures the pixel law exists to prevent cannot occur here.
- The exemption is **bounded by the zoom ceiling.** The widest *frame* is
  **1920×1080** — twice the 960×540 base, which is exactly the device output at
  integer 2× — so a shot at 1.00× is 1:1 on screen with no resampling at all.
  1.15× is the hard ceiling, and a 15% upscale of a painted plate is invisible.
  Beyond that it is not.
- **Plate size is the frame plus the bleed.** A normal plate is **2048×1208**;
  shot 5's is **2688×1208**, because the pan has to run out of screen before it
  runs out of Grubb; shot 7's is **2048×1478**, because the tilt needs somewhere
  above the frame to go.
- The other half of the exemption lives in the runtime: plates draw with
  `TEXTURE_FILTER_LINEAR`, against the project's Nearest default. Nearest is
  right for every sprite in the game and wrong here — at 1.07× it doubles some
  rows of a painted plate and not others, and the seam crawls as the camera
  moves.

Anything drawn *for* the cinematic that will also appear in gameplay — a sprite,
a tile, a prop — is not a plate and is not exempt.

### 4.3 The byte budget

**2.0 MB for the whole prologue. 400 KB for any single plate.** Enforced by the
validator; `npm run validate` fails over it.

This is the number that keeps the film from hurting the boot funnel, so when a
plate comes in over budget the answer is **fewer layers or flatter art, never a
bigger budget.** Flat fills and hard edges (which is the house style anyway,
`§5`) compress to a fraction of a gradient.

### 4.4 Memory, not just bytes

A 2048×1208 plate is ~10 MB decoded. Eighteen of them resident is 180 MB, which
a low-end tablet browser will not forgive. The runtime therefore keeps **at most
two shots' plates in memory** — the one playing and the one next — and frees the
rest. That is a runtime guarantee (§5.2), not a hope.

---

## 5. The handoff into profile creation

This is the part worth getting right, and it costs nothing.

### 5.1 The film does not end. It becomes the screen.

Shot 7 ends on empty dawn sky. The cinematic scene has a live `ScreenBackdrop`
(the theme-driven painted sky already behind every non-gameplay screen) sitting
underneath the plates. The final `cine_fade` fades the plates out to reveal it —
so the last thing the film does is dissolve into the actual background of the
actual UI. Then the scene routes to `login`, which builds the same
`ScreenBackdrop` from the same theme.

**There is no cut, no black frame and no loading state between the story and the
name field.** The child watches a crow fly up into a sky, and then their name
goes on that sky.

It works because `ScreenBackdrop` paints from theme tokens rather than art, so
both scenes draw an identical sky. Free, and it is the difference between "a
video played before a form" and "one experience".

### 5.2 The flow, exactly

```
Boot
 ├─ a profile already exists ──────────────────► main_menu   (unchanged)
 ├─ no profile, prologue already seen ─────────► login       (unchanged)
 └─ no profile, prologue not seen ─────────────► cinematic ──► login
```

- **Gated device-wide, not per profile.** There is no profile yet when it plays,
  so "seen" is stored against the device (`crow_prologue_seen`), which is also
  correct for a second child on the same tablet — the film is a first-*launch*
  event, not a first-*child* event.
- **Marked seen the moment it starts**, not when it finishes. A child who skips
  at 0.4s has still met it, and re-showing it on the next launch is how a
  cinematic becomes a thing to dread.
- **Any failure routes to `login`.** Missing data, empty shot list, unloadable
  plate: the scene routes on and the child plays. Rule 4 of §1.

### 5.3 Getting out

Two affordances, because a five-year-old and a parent want different things:

| Input | Effect |
| --- | --- |
| Tap / click anywhere, any key, any gamepad button | **advance** to the next shot immediately |
| The skip control, top-right | straight to profile creation |

- **Tap advances rather than skips**, so a child pressing impatiently is
  self-serving their way to the game rather than being ignored, and reaches it in
  a couple of seconds without ever finding a button.
- It sits **top-right**, this app's utility corner — where `login.gd` puts the
  language chips. Built at bottom-right first and it landed in the lower third
  of the frame beside the caption, as the brightest thing on screen: a control
  competing with the picture it was offering to skip.
- The skip control is **drawn, not typed** — a double chevron in `Polygon2D`, no
  font glyph anywhere near it. `tools/validate_i18n.mjs` carries the scar that
  made this a rule: the login PIN dots were U+25CF, which Godot's built-in font
  does not have, and they shipped as boxes printing their own codepoints. UI
  primitives are geometry.
- It is **focusable** and takes the focus ring, so keyboard and gamepad reach it
  (`§12`).
- Skipping and finishing land in the same place, so there is nothing to lose by
  skipping and nothing to regret.

### 5.4 Accessibility

- **Reduced motion** (`§12`): camera moves off, layer drift off, crossfades and
  every duration unchanged — timing and audio sync must not shift, which is the
  explicit brand rule. The film still works; it becomes a slideshow of held
  frames, which is exactly what shot 3 already is.
- **No flash.** The film contains no full-screen flash at all, so the 3Hz/0.4α
  limits are met by construction.
- **Nothing requires reading.** Every caption is optional by design (§3.4) and
  the skip control is an icon.
- **Nothing requires hearing.** §1 rule 1.

### 5.5 The one gap, named

**There is no replay entry point yet.** `MainMenu`'s layout is tight and
hand-tuned against a 540px viewport, and adding a button to it without being
able to run the engine and look at it is how that layout gets broken. The scene
is registered as `cinematic` in `scenes.json`, so the button is one
`SceneRouter.goto("cinematic")` when the menu is next opened for other work.

Until then, re-watching means clearing `crow_prologue_seen` — documented in
`ONBOARDING_AGENT.md` with the other state-reset keys.

Children ask to watch things again. This should not stay open long.

---

## 6. The pipeline

Four pieces: a schema, the data, a validator, and a player.

### 6.1 Authoring

| Piece | Path |
| --- | --- |
| Schema | `authoring/cinematics/schemas/cinematic.schema.json` |
| Data | `godot/data/cinematics/prologue.json` |
| Placeholders | `tools/gen_placeholder_cinematic.mjs` |
| Validator | `tools/validate_cinematics.mjs`, in `npm run validate` |
| Player | `godot/scenes/Cinematic.tscn` + `godot/scripts/scenes/cinematic.gd` |
| Test | `godot/tests/test_cinematics.gd` |

The data is **hand-authored and read directly** — no compile step, unlike levels.
There is nothing to expand: a shot list is already the shape the runtime wants,
and a compile step would only add a way for the two copies to disagree.

A new cinematic is: a JSON file in `godot/data/cinematics/`, an entry in
`DataManager.PATHS`, its caption keys in both string bundles, and its plates. No
new code.

### 6.2 What the validator enforces

Ordered by how much grief each one saves:

1. **The frame never leaves the plate.** For every shot, every `from`/`to` rect
   is checked against the real pixel dimensions of every layer in it. This is
   the bug this kind of system always ships and it is pure arithmetic to catch.
2. **Rects are 16:9**, within a pixel, so no shot silently stretches.
3. **Zoom within 1.00×–1.15×** of the plate (§4.2).
4. **Byte budget:** 2.0 MB total, 400 KB per plate (§4.3).
5. **Every plate exists** at its declared path, and its real dimensions match the
   declared ones.
6. **Every caption key exists in every locale.** Both bundles, or fail.
7. **Every audio key exists** in the audio manifest or the sound-event map.
8. **Total runtime ≤ 60s** (§1 rule 6).
9. **Drift ≤ 5px, parallax ≤ 1.0** (§3.3).
10. **Schema conformance**, via the `ajv` already in `devDependencies`.

### 6.3 The player

`cinematic.gd`, and the four things worth knowing about it:

- **Two stages, crossfaded.** Stage A holds the current shot's layers, stage B
  the next; a transition tweens their modulate alpha against each other over
  `cine_fade`. Two stages is all a crossfade needs and it caps live plates at
  two shots (§4.4).
- **The camera is a transform, not a shader.** A source rect `(x, y, w, h)` on a
  plate maps to the viewport by `scale = 960 / w`, `position = -(x, y) * scale`.
  Tweening that mapping between `from` and `to` *is* the Ken Burns move, it costs
  nothing per frame, and it is why the validator can check the framing
  arithmetically.
- **Plates load one shot ahead**, during a hold, where a hitch is invisible.
  Never during a transition, where it is the only visible thing.
- **It always routes on.** Every failure path ends at `login` (§5.2).

---

## 7. On-brand test for a cinematic shot

`BRAND_SYSTEM.md §13` has five questions for anything in the game. A shot has
five more, and a No is a rewrite:

1. **Muted and unread, can a five-year-old say what happened?** (§1.1)
2. **Would a scared child be scared?** Look at it again assuming yes.
3. **Is exactly one thing moving the camera?** (§3.2)
4. **Is the frame still on the plate at every point of the move?** (§3.2)
5. **Does the caption say something the image does not?** If it repeats the
   image, cut the caption. If it carries the fact alone, the shot is broken.

### Off-brand, concretely

- Grubb's whole body in frame. Grubb's face in frame. Grubb moving toward camera.
- A hard cut. (There are none in the film; shot 3 lands on stillness, not on a
  cut.)
- A caption the plate cannot survive without.
- A shot that has to be watched to understand the game.
- Black between the last shot and the name field.

---

## 8. Open questions

1. **Does the prologue ship at launch or after world art?** The pipeline runs on
   placeholders, so either answer is cheap. No recommendation.
2. **The replay button** (§5.5). Recommend it lands the next time `MainMenu` is
   opened for other work.
3. **Is the wrong count a real audio asset or a stretch of an existing one?**
   Three seconds of voice would carry world 4 as well as the film. One file.
4. **Per-world cinematics.** The format is general — five shots between worlds
   would cost five plates each and no new code. Out of scope here, deliberately;
   the prologue should be proven on a real child first.
