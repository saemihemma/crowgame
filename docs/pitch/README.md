# Investor Pitch Deck

Status: Supportive
Authority: Presentation artifact. Product numbers in the deck are sourced from the dated snapshot in [ONBOARDING_AGENT.md](../../ONBOARDING_AGENT.md) and the architecture docs; external claims are cited on the deck's own final slide.
Last verified against code: 2026-08-24

## What Is Here

- [hormann-pitch-deck.html](./hormann-pitch-deck.html) — 17 slides, one self-contained file.
  All art, screenshots and styling are inlined as data URIs. No network access,
  no build step, no dependencies.

Brand rules the deck follows: [docs/BRAND_GUIDELINE.md](../BRAND_GUIDELINE.md).

## Exporting A PDF

The deck is laid out at exactly `1280x720` css px per slide, which is one
landscape 16:9 page.

1. Open the HTML in Chrome or Edge.
2. Print (`Ctrl+P` / `Cmd+P`).
3. Landscape, margins **None**, **Background graphics on**.
4. Save as PDF.

The print stylesheet strips all animation and forces every reveal to its final
state, so the PDF matches the last frame of the screen version. Expect exactly
17 pages at `960x540` pt.

## Regenerating The Screenshots

The gameplay screenshots are real captures of the running build, not mockups.
They came from a Playwright harness driving the live login flow into the Math
Practice Arena, in the same shape as [tools/i18n_screenshots.mjs](../../tools/i18n_screenshots.mjs)
— start `npm run dev`, drive `LoginScene -> MainMenuScene -> LevelSelectScene ->
GameScene`, walk right into an owl, and shoot `MathChallengeScene`.

If the deck is refreshed, re-verify the product figures against the dated
snapshot block before publishing: the deck quotes problem, level and locale
counts, and those drift.

## Placeholders

Fields still to fill are marked in cyan: the founder's name and the three hiring
statuses on the team slide, the pilot status on the traction slide, and the
per-pupil / per-month price on the model slide. Everything else is either
sourced on the final slide or taken from the repository.

## Numbers That Must Stay Consistent

The ask slide and the arithmetic slide are coupled. The arithmetic prices a
four-person team at ~12.6m ISK a month (1.75m salary +33% employer cost, +35%
contractors); the ask funds one hire with the founder deferred. Change the
headcount on one and the other stops adding up.
