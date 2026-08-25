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

One field is still to fill, marked in cyan: the pilot status on the traction
slide. Everything else is either sourced on the final slide or taken from the
repository.

The lore on the world slide — Hörmann as the clever crow, the owls as chained
knowledge — is a proposal, not shipped narrative. The game's own strings do not
yet tell that story; if it changes, that slide changes with it.

## Numbers That Must Stay Consistent

The ask slide and the arithmetic slide are coupled, and so is the model slide's
price row.

- Burn: two full-time people plus contract art, audio and academic time =
  EUR535k/USD623k a year. The per-head salary arithmetic sits here, not on the
  deck: investors are shown the total, not a payroll line.
- Ask: EUR600k = that burn for twelve months plus the pilot, the study and tools.
  Use of funds on the ask slide is 66/23/7/4 and must total the same EUR600k.
- Break-even: 6,500 subscriptions at USD10 a month net of a 20% store cut. Half of
  Iceland's schools at 2,000 ISK per pupil per year plus 2,400 families gets
  there too.
- The science slide brackets the target accuracy band with two sources: Math
  Garden's .75 success probability and the Nature Communications 85% rule. The
  shipped band is 70-85% and must stay inside that bracket to be honest.
- Rates used: ISK/EUR 141, ISK/USD 121.

Change headcount, price, or the store-fee assumption and all four numbers move.
A third salary takes burn to 9.4m ISK a month and break-even to ~9,700 subs.
