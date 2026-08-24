# Hörmann Brand Guideline

Status: Supportive
Authority: Presentation and communication rules. Every value here is derived from shipped runtime art and `public/data/themes/*.json`. Runtime truth still lives in the theme JSON and the asset files.
Last verified against code: 2026-08-24

## Purpose

This document is the one place that says what Hörmann looks and sounds like outside the game:
decks, one-pagers, store pages, school-facing material, landing pages.

What this is:
- a palette, type, motion, and voice contract
- derived from real assets, not invented for marketing

What this is not:
- not a runtime theme spec (that is `public/data/themes/*.json`)
- not a product-intent doc (that is [PROJECT.md](../PROJECT.md))

## The Core Idea

Every owl in Hörmann is wearing a padlock and a chain.

The child does not take a test. The child **frees something** — and math is the key.
That single image is the brand. Every surface should feel like unlocking, never like grading.

Consequences that are non-negotiable:
- we never draw a red X, a score out of ten, a percentage, or a report card
- failure is drawn as *not yet open*, never as *wrong*
- the reward is always visible before the effort is asked for

## Voice

Taken verbatim from shipped strings, which are the tone reference:

> "A Math Adventure"
> "Watch closely, I will show you!"
> "Your turn!"
> "Two fingers on one hand, two on the other!"

Rules:
- **Short.** Six to nine words is a full sentence.
- **Second person.** You, your turn, you found it.
- **Mentor, not examiner.** Professor Hoot explains, then steps back.
- **Present tense, active.** "You free the owl", not "owls can be freed".
- **No school register.** Never *assessment*, *curriculum objective*, *proficiency*, *remediation* in child-facing or parent-facing copy.

Investor and school register may be precise and quantitative. It must still be short.

## Palette

Sampled from `public/assets/sprites/**`, gameplay frames, and `public/data/themes/theme_forest.json`.

### Core

| Role | Hex | Source |
| --- | --- | --- |
| Gold — reward, headline, the one accent | `#ffd700` | `theme_forest.json` `accent`, coin, title text |
| Ink — crow body, deepest ground | `#18191f` | crow sprite |
| Slate — crow highlight, cool shadow | `#3b444f` | crow sprite |
| Sky — gameplay background | `#87ceeb` | gameplay frame |
| Forest — primary surface green | `#4a7c59` | `theme_forest.json` `primary` |
| Soil — ground fill, deep panel | `#3c2015` | gameplay frame |

### Wood (panels, boards, buttons)

| Role | Hex | Source |
| --- | --- | --- |
| Board fill | `#5c3a1e` | `theme_forest.json` `boardBg` |
| Board border | `#3d2510` | `theme_forest.json` `boardBorder` |
| Button fill | `#6b4e1b` | `theme_forest.json` `buttonBg` |
| Bark / secondary | `#8b6914` | `theme_forest.json` `secondary` |

### Owl warmth (the teaching colour)

| Role | Hex |
| --- | --- |
| Cream | `#faf1de` |
| Amber (eyes, padlock) | `#fcbf4e` |
| Rust | `#c76237` |
| Deep rust | `#93381d` |

### Signal

| Role | Hex | Use |
| --- | --- | --- |
| Danger | `#cc3333` | hearts, hazards. **Never** used to mark a wrong answer. |
| Circuit cyan | `#44ccff` | the sci-fi reskin, padlock runes, "future" accents only |

### Rules

- **One accent per surface.** Gold carries the eye. If a slide has two competing accents, one is wrong.
- Gold on Ink or Gold on Soil for headlines. Never gold on Sky.
- Cyan appears only where the subject is the *next* Hörmann, never the current one.
- Danger red is for health and hazard. Correct/incorrect is signalled by gold gained, never red lost.

## Typography

The game's HUD font is `monospace` (`theme_forest.json` `hud.font`). Keep it.

- **Display and body: monospace.** Stack: `ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace`.
- **Headlines: uppercase, wide tracking** (`0.04em`–`0.10em`), gold, with a hard pixel outline.
- **Pixel outline, not blur.** Text shadow is an offset of whole pixels in Ink — `3px 3px 0 #18191f` — never a soft glow. The game outlines its title exactly this way.
- Numbers are the loudest thing on any surface. A statistic may be 3–5× the body size.
- No serif. No script. No second typeface.

## Pixel And Geometry

- Sprites are 64 px, rendered at integer scale. Any embedded art uses `image-rendering: pixelated`.
- Design space is `960x540`, shipped crisp at `1920x1080` via `2x` integer scaling. Presentation art keeps the 16:9 frame.
- Corners: 2–6 px radius maximum. Hörmann's panels are chunky-square, not pill-shaped.
- Borders are 2–4 px solid, one shade darker than the fill. No gradients on borders.
- Layer order, back to front: sky, ground, subject, panel, gold.

## Motion

Motion exists to reward, never to decorate.

- **Snap in, settle slow.** Entry 180–260 ms; the settle can take 600 ms.
- **Whole-pixel movement.** Translate by integers. Nothing drifts sub-pixel.
- **Gold pulses, nothing else does.** One pulsing element per screen.
- Numbers count up; they never fade in.
- Nothing loops forever in the periphery. A child's eye — and an investor's — should land where the point is.
- Every animation must be inert in print. A printed frame is the final frame.

## Do / Don't

Do:
- one idea per surface
- show the crow, the owl, or the chain — the cast *is* the brand
- lead with a number when there is one
- keep real screenshots; they are more persuasive than mockups

Don't:
- stock photography of children at laptops
- rounded corporate gradients, glassmorphism, drop shadows with blur
- more than one accent colour
- red as a failure marker
- the words *gamification*, *engagement*, *leverage*, *synergy*

## Where This Is Applied

- [docs/pitch/hormann-pitch-deck.html](./pitch/hormann-pitch-deck.html) — investor deck, self-contained, print-ready at 16:9
