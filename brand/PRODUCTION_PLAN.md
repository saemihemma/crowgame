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
| B1 | **No letterbox above 8%** on iPad and iPhone **in landscape** | canvas area ÷ viewport area, per device profile |
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

**Gates are measured on the Godot build.** The device audit currently drives the
retired Phaser build and moves across as part of Phase 0b. See §2a.

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
| Godot port | Has none of the last five commits, and its own suite says so: `owl_probe` reports "2 problems solved" against a web build where one answer breaks the chain |

**The single biggest problem is B1.** Even in landscape — the shipping
orientation — 18–19% of a tablet screen is black bars. That is the difference
between a game that looks made for the device and one that looks ported to it.

---

## 2a. One runtime: Godot

**Decided 2026-08-24, superseding the two-runtime rule written the same day.**
Hörmann is a Godot game. The Phaser build is retired.

That reverses the direction of the whole backlog. What was "port the web changes
to Godot for parity" is now "the web build was a prototype, and everything good
in it has to be rebuilt in the real runtime." The list is the same; its status
is not.

**The visual loop survives the move, which was the precondition for making it.**
Godot renders under a virtual display with the `gl_compatibility` driver, so
`godot/tools/capture` boots a level, settles it and writes a PNG:

```
xvfb-run -a --server-args="-screen 0 1280x800x24" \
  godot --path godot res://tools/capture/Capture.tscn -- level_01
```

Concept → implement → capture → compare therefore continues unbroken. Without
that, retiring the web port would have thrown away the process along with the
prototype, and would have been the wrong call.

### What the Godot build is missing

Measured from a real capture, not assumed. The first shot showed a flat
`#87CEEB` sky, the forest tileset in every world, and a HUD reading
`Lives: *** / Coins 15 / Owls 3` in plain yellow text.

| Behaviour | Prototyped in Phaser | In Godot |
| --- | --- | --- |
| Five world themes, per-level | yes | no — `theme_manager.gd` has `forest` and `scifi` |
| Themed sky gradient | yes | no — hardcoded `#87CEEB` |
| Five world tilesets | yes | PNGs are present, nothing loads them |
| Feel pass: squash, anticipation, hitstop, look-ahead, coin bob | yes | no |
| Wrong-answer choreography, amber, 900ms | yes | no |
| Dynamic maths-board layout | yes | no |
| Three-pod HUD + owl ring | yes | no — three lines of yellow text |
| Streak | yes | no |
| One-answer owl roster | yes | no — `owl_probe` still solves 2 |

### Retirement, staged

The web build is retired in stages rather than deleted in one commit, so the
rebuild has something that still runs to check against. Order:

1. Declare it. Nothing in the docs may present `src/**` as current. *(done)*
2. Rebuild each row of the table above in Godot, verified by capture and by
   `run_tests.sh`.
3. Retire the Playwright harnesses as their Godot equivalents land.
4. Move `src/**`, `vite/**`, `index.html`, `public/**` and the web CI into
   `archived/`.

**`godot/data/**` is the data truth.** `public/data/**` was a near-mirror that
nothing kept in sync — `npc_registry.json` had already diverged, and
`godot/data/math` is a hand copy no tool writes. Anything that generates data
repoints at the Godot tree as part of step 2.

**Staying either way:** `admin.html`, which is an ops surface rather than part
of a game build, and the math authoring pipeline under `tools/`, which produces
the curriculum the game reads.

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

### Phase 0 — Make the loop able to see — **in progress**

Nothing else can be judged until this exists.

**Landed:** `npm run device:audit` (`tools/device_audit.mjs`) opens iPad
landscape, iPhone landscape and desktop with real touch emulation and device
pixel ratios, and measures B1, B3, B4, B5, B7 and B10 **from the live scene
graph** — never from source, because source says what was intended.

Baseline on today's build, which is the acceptance criterion (the harness must
report the failures that should fail):

| Gate | iPad | iPhone | Desktop |
| --- | --- | --- | --- |
| B1 letterbox | **19.1%** | **18.0%** | 0.0% |
| B3 touch targets | pass (5) | pass (5) | n/a |
| B4 safe area | **1 inside 32px** | **1 inside 32px** | n/a |
| B10 reach | pass | pass | n/a |
| B5 time to input | 2.7s | 2.0s | 2.0s |
| B7 text | **JUMP / ZAP / PECK @18px** | same | pass |

Six failures, all three of them real Phase 1 problems, each caught twice.

B7 is measured in **two tiers**, because the bible's rule is "nothing a child
must read": a 16px hard floor for everything, and 24px for anything not marked
`setData('redundant', true)`. The owl ring's own numbers are marked — the ring
carries the meaning, the numbers only confirm it. The audit caught them at 15px
and 11px, which was a straight violation of a rule this document wrote.

**Still to land in Phase 0:** the unvisited screens (login, menu, level select,
pause, completion), the unreached states (damage, streak 3 and 5, an ability
granted), B2's throttled frame trace and B9's reduced-motion run.

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

- **Concept:** how the game fills a landscape tablet. Portrait is out of scope,
  so the question narrows to what the extra *width* carries at 3:2 and 19.5:9 —
  more world ahead of the player, or a wider safe frame with the HUD moved
  outboard. Draw both; they read very differently at speed.
- **Concept:** the control scheme. Fewer, larger, icon-only, one-thumb
  reachable, with the pressed state visible to a child who cannot see their own
  thumb. Gestures where they genuinely beat a button. Haptics on every state
  change the finger cannot see.
- Implement scaling, then controls.
- **Gate:** B1, B3, B4, B5, B10 pass on all four device profiles.

*Watch out:* changing the camera's horizontal extent changes how much of a level
is visible at once, which changes jump readability and enemy warning time.
`level_compiler.ts` derives map size from the spec, so this is still the phase
most likely to invalidate content — settle it before Phase 5.

*Also:* a landscape-only game must handle being held in portrait. A rotate
prompt is part of this phase, not an afterthought, and it is the first thing a
child sees if they pick the tablet up the wrong way.

### Phase 2 — The screen flow

Login, menu, level select, pause, completion — currently five screens speaking a
different visual language from the game they wrap.

- Concept all five as one flow, at device resolution, including the transitions.
- First-run onboarding: how a child learns to move, jump and meet an owl without
  reading anything.
- **Gate:** B6, B7, B8 across all five screens in all five worlds.

### Phase 3 — Art production — **the user draws it**

The art is **not mine to make**. My job in this phase is that the contract an
artist works against is correct, complete and impossible to misread — and the
one time I got that wrong it would have cost a hundred wasted tiles (the manifest
claimed a 320×320 sheet with a nine-tile order; the compiler places three tiles
on a 128×128 sheet).

So this phase is, for me:

- Keep `ASSET_MANIFEST.md` exact: sizes, destinations, wiring target, seam
  constraints, and the non-figurative rule for organic materials.
- Make every drop-in path work with **no code change** — the tileset manifest
  already does this; the maths-board nine-slice does not yet and needs
  `MathBoard.drawBoardBackground()` to accept a texture with a `Graphics`
  fallback.
- Provide a **preview harness**: drop a PNG in, see it in all five worlds in the
  running game, without hand-wiring.
- Verify each delivered asset against the contract and against B8.

- **Gate:** every `tileset_manifest.json` entry reads `"source": "authored"`;
  B8 holds in both runtimes; `tools/gen_tilesets.mjs` is deleted.

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

### Phase 0b — Close the Godot divergence

Promoted out of Phase 7, because the port is current (§2a) and every phase after
this one costs double if the backlog is still open when it starts.

Port the table in §2a in that order, running `run_tests.sh` after each. Extend
the suite where the web side gained behaviour the port cannot currently assert —
the owl roster, the streak, the wrong-answer timing.

- **Gate:** `run_tests.sh` green, `owl_probe` solving one problem, and the five
  worlds visibly themed in the Godot build.

---

## 5. What blocks what

- Phase 0 blocks everything. Every later gate is measured by it.
- Phase 0b should finish before Phase 1, or Phase 1 lands on a port that is
  already ten changes behind and the merge gets worse.
- Phase 1 blocks Phase 5: the camera's vertical extent decides level geometry.
- Phase 1 blocks Phase 2: screen layout depends on the aspect-ratio answer.
- Phase 3 is independent of 1 and 2 and can run in parallel, one file per PR.
- Phase 6 needs Phase 3 finished to measure anything real.
- Phase 7 gets more expensive with every phase that passes.

---

## 6. Decisions

**Settled 2026-08-24:**

1. **Landscape only.** Portrait is out of scope; a rotate prompt is in scope, in
   Phase 1. B1 is measured in landscape only.
2. **The Godot port is current and needed.** Every phase lands twice; §2a is the
   standing rule and Phase 0b clears the existing debt.
3. **The user draws the art.** Phase 3 is contract, tooling and verification on
   my side — no generated art beyond the placeholders already in.

**Still open:**

4. Is the five-level progression the shipping scope, or a vertical slice for a
   larger game? It changes how much Phase 5 invests in each world.
