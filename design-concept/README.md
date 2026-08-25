# Concept UI

Status: Supportive
Authority: Design intent for the HUD and the maths window. Runtime truth is
`godot/scripts/ui/**`.

Working files for the concept design canvas. `hormann-hud-concept.html` is the
seeded canvas; the `.dc.html` files and `canvas.json` are what it is built from,
so every later change re-seeds from these rather than editing the output.

| File | Artboard |
| --- | --- |
| `Main.dc.html` | HUD — three pods, over a real gameplay plate |
| `Streak.dc.html` | Streak states at 0, 1, 3, 5 and after a miss |
| `MathWindow.dc.html` | Maths window in Emberwood, Prism Hollow and Geyserworks material |
| `WrongAnswer.dc.html` | The 900ms wrong-answer beat, frame by frame |

The `plate-*.png` files are gameplay captures at 960×540 with the HUD stopped, so
the concept can be compared directly against a screenshot of the implementation.
They were taken from the retired Phaser prototype, so they show the old
left-edge text HUD rather than what ships; refresh them with

**Most of what these artboards specify has since been built** — `hud.gd` composes
`HeartRow`, `CoinChip` and `OwlRing` as separate pods, and the maths board
measures and grows rather than sitting at a fixed size. Treat this folder as the
design record for that work, not as an outstanding brief. What remains open is
tracked in [../roadmap.md](../roadmap.md).

## What the concept got wrong

Kept here because it is the useful part. The HUD artboard was mocked *over* a
screenshot, which let the scene supply contrast the HUD needed to supply itself.
Implemented against a real dawn sky, the owl ring became the least visible thing
on screen. That produced a brand rule — BRAND_SYSTEM §8.6b, "the HUD carries its
own contrast" — which would not have existed without building the thing and
looking at it.

Three concept states still have no implementation evidence: a lost heart, the
streak flame at 3+, and a charged ability slot. See `roadmap.md`.
