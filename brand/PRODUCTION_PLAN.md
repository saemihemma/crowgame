# Hörmann — Production Plan

Status: Supportive
Authority: Sequencing and acceptance gates for the road to ship. Brand law is `BRAND_SYSTEM.md`; open work is `../roadmap.md`; runtime truth is `src/**`.
Last verified against code: 2026-08-24

The standard is a game that could win a mobile award in 2026. This document
says what that means in numbers, where the build actually is against it, the
loop every phase runs, and the order the phases have to happen in.

---

## 1. The bar, in numbers

"Award standard" is not a feeling. These are the gates. A phase is not done
until its rows pass, measured, on a device profile — not on a desktop browser.

| # | Gate | Measured how |
| --- | --- | --- |
| B1 | **No letterbox above 8%** on iPad and iPhone, either orientation | canvas area ÷ viewport area, per device profile |
| B2 | **Sustained 60fps** on a 4× CPU-throttled profile at 1024×768 | Playwright CDP performance trace, p95 frame time ≤ 16.7ms |
| B3 | **Every touch target ≥ 64px**, primary action ≥ 80px, ≥ 12px apart | measured from the live scene graph, not from source |
| B4 | **Nothing interactive within 32px** of a safe-area edge | same |
| B5 | **First input accepted < 3s** from cold load on a throttled profile | navigation timing to first enabled control |
| B6 | **No essential meaning carried by text alone** in gameplay UI | audited per screen; icons must survive with strings blanked |
| B7 | **No text below 24px** anywhere a child must read | scene-graph audit |
| B8 | **Every screen ≥ 85% on-palette** in all five worlds | `themes:screenshots` conformance, extended to every screen |
| B9 | **Reduced motion honoured**; no flash > 0.4 alpha or > 3Hz | flagged run of the harness |
| B10 | **One-thumb reachable**: every gameplay control inside a 620px arc from each bottom corner | scene-graph audit against a reach mask |

Gates B1, B3, B4, B5 and B10 are **currently unmeasurable** — the harness has
never opened a device viewport. Phase 0 exists to fix that.

---

## 2. Where the build actually is

Verified this session, not remembered.

**Solid.** Five worlds themed end to end from data; the feel pass (squash,
anticipation, hitstop, look-ahead, coin bob); the 900ms wrong-answer beat in
amber; the three-pod HUD with the owl ring; one-answer owls with a per-NPC
roster; web CI; a screenshot harness with palette conformance over 24 shots.

**Placeholder, and honest about it.** Five tilesets at 5.5–6.5 out of 10; all
15 SFX procedurally generated; one music motif in five identical arrangements;
the maths window themed by colour only.

**Not started.**

| Area | State |
| --- | --- |
| Touch controls | Five text-labelled squares — `<`, `>`, `JUMP`, `ZAP`, `PECK` — at 88px, **16px padding** (inside the 32px touch safe area), always at full presence, no haptics, no gestures, positioned from a fixed 960×540 |
| Scaling | `Phaser.Scale.FIT` on a fixed 16:9 canvas. **iPad portrait wastes 61% of the screen; iPhone portrait wastes 74%** |
| Screen flow | Login, main menu, level select, pause and completion are all pre-brand-system |
| Onboarding | No first-run teaching of any mechanic |
| Performance | Never measured, on any profile |
| Godot port | Has none of the last five commits |

**The single biggest problem is B1.** A child picks up an iPad, holds it the way
children hold iPads, and three-fifths of the screen is black. No amount of art,
juice or HUD polish survives that, which is why it is Phase 1 and not Phase 5.

---

## 3. The loop

Every phase runs the same loop. It is deliberately uncomfortable: the concept is
drawn to a standard the implementation is not expected to reach on the first
try, and the gap is written down rather than designed away.

1. **Concept.** Artboards at the real target resolution, in real tokens, over
   real captures. Ambitious on purpose.
2. **Accept the concept** as the target. Not as the plan — as the thing the
   implementation will be judged against.
3. **Implement.**
4. **Capture.** `themes:screenshots` on every affected screen, world and device
   profile. Never judge from source.
5. **Compare, brutally.** Name every gap. Fix what is a defect. For what is not
   reachable, write it into `roadmap.md` with the reason.
6. **Re-capture.** Repeat 3–6 until the phase's gates pass.

**What this loop has already caught**, which is why it stays: the owl ring was
mocked over a screenshot and shipped as the *least* visible thing on the HUD;
the harness had never actually clicked a wrong answer; a shifted heart outline
left a notch on every heart; an ink pill that worked on Emberwood dissolved into
Sugarstorm; `shade()` overflowed to negative RGB and wrapped to white; a
`clump()` cell that did not divide 32 printed a fixed motif into every tile.

**Rule: no phase is accepted on a desktop screenshot alone.** The primary device
is a tablet. Phase 0 is what makes that rule enforceable.

---

## 4. Phases

Ordered by what unblocks what, not by what is most fun.

### Phase 0 — Make the loop able to see

Nothing else can be judged until this exists.

- Device matrix in `theme_screenshots.mjs`: iPad landscape/portrait, iPhone
  landscape/portrait, desktop. Playwright `hasTouch`, `deviceScaleFactor`,
  real viewport sizes.
- Drive **touch** events, not mouse.
- Cover the screens the harness has never opened: login, menu, level select,
  pause, completion.
- Cover the states it has never reached: damage taken, streak at 3 and 5, an
  ability granted.
- A scene-graph audit that measures B3, B4, B7 and B10 from the live game
  objects rather than from source.
- A throttled CDP performance trace for B2 and B5.

**Gate:** the harness reports a pass/fail for B1–B10 on every device profile, and
today's build fails the ones it should fail.

### Phase 1 — The device: scaling and touch

The award blocker. Concept first, because the answer is a design decision, not
a config flag.

- **Concept:** how the game occupies an iPad in portrait. Three real options
  worth drawing — a taller camera with more vertical world; a fixed-height
  design with horizontal extension; portrait as a distinct composition with the
  HUD moved into the reclaimed space. They are not the same game.
- **Concept:** the control scheme. Fewer, larger, icon-only, one-thumb
  reachable, with the pressed state visible to a child who cannot see their own
  thumb. Gestures where they genuinely beat a button. Haptics on every state
  change the finger cannot see.
- Implement scaling, then controls.
- **Gate:** B1, B3, B4, B5, B10 pass on all four device profiles.

*Watch out:* changing the camera's vertical extent changes what every level
looks like, and `level_compiler.ts` derives map height from the spec. This is
the most likely phase to invalidate existing content — decide it before Phase 5.

### Phase 2 — The screen flow

Login, menu, level select, pause, completion — currently five screens speaking a
different visual language from the game they wrap.

- Concept all five as one flow, at device resolution, including the transitions.
- First-run onboarding: how a child learns to move, jump and meet an owl without
  reading anything.
- **Gate:** B6, B7, B8 across all five screens in all five worlds.

### Phase 3 — Art production

The 91 files in `ASSET_MANIFEST.md`, in its priority order. The manifest already
carries sizes, destinations, wiring targets and the geometry contract.

Order within the phase: tilesets (replace the placeholders), parallax, hero
animation set and scarf, the four Muddle species, chain links, maths-window
nine-slice, themed UI sprites.

- **Gate:** every `tileset_manifest.json` entry reads `"source": "authored"`;
  B8 holds; `tools/gen_tilesets.mjs` can be deleted.

### Phase 4 — Audio

- Replace all 15 procedurally generated SFX against §11 of the bible.
- Five real arrangements of the one motif.
- Wire the streak-pitched correct-answer chime (the parameter exists,
  `getPitchSteps()`, and nothing consumes it).
- **Gate:** no `gen_sfx.py` output remains; ducking and the pitch ladder are
  audible in a captured run.

### Phase 5 — Level content and pacing

- Grow `level_03` and `level_04` to carry their worlds (18–24 platforms).
- Place the owl roster deliberately per the art bible's per-world notes.
- Build each world's signature gimmick — leaf spouts, mirror crystals, bumper
  chains, conveyors and pistons, wind lanes.
- **Gate:** a full five-level playthrough captured end to end, no world sharing
  a mechanic, difficulty curve reviewed.

### Phase 6 — Accessibility and performance hardening

- Reduced motion, colour-blind verification beyond the token check, text scale.
- Frame budget: particle caps, tween counts, draw calls on the throttled profile.
- **Gate:** B2 and B9 pass with the full art load in.

### Phase 7 — The Godot decision

The port has none of the last five commits and cannot be exercised from this
container. It is drifting further every phase.

This is **a decision, not a task**: either the port is current and every phase
lands twice, or it is declared non-current in `README.md` and the parity tests
retire with it. Deciding late is the expensive option.

---

## 5. What blocks what

- Phase 0 blocks everything. Every later gate is measured by it.
- Phase 1 blocks Phase 5: the camera's vertical extent decides level geometry.
- Phase 1 blocks Phase 2: screen layout depends on the aspect-ratio answer.
- Phase 3 is independent of 1 and 2 and can run in parallel, one file per PR.
- Phase 6 needs Phase 3 finished to measure anything real.
- Phase 7 gets more expensive with every phase that passes.

---

## 6. Open decisions

These are the user's, and three of them gate work:

1. **Portrait, landscape, or both?** Both is the award answer and roughly doubles
   Phase 1 and 2. Landscape-only with a rotate prompt is defensible for a
   platformer and much cheaper. **Gates Phase 1.**
2. **Godot: current or retired?** **Gates Phase 7, taxes every phase until answered.**
3. **Who draws the art?** The manifest is written for a human tile artist.
   Generated placeholders got to ~6/10 and will not get much further.
4. Is the five-level progression the shipping scope, or a vertical slice?
