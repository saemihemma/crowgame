# Investor Pitch Deck

Status: Supportive
Authority: Presentation artifact. Product numbers in the deck are sourced from the dated snapshot in [ONBOARDING_AGENT.md](../../ONBOARDING_AGENT.md) and the architecture docs; external claims are cited on the deck's own final slide.
Last verified against code: 2026-08-24

## What Is Here

- [hormann-pitch-deck.html](./hormann-pitch-deck.html) — 16 slides, one self-contained file.
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
16 pages at `960x540` pt.

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

Two values on the ask slide are intentionally unset and marked in cyan:
`[amount]` and `[runway]`. Everything else in the deck is either sourced or
taken from the repository.
