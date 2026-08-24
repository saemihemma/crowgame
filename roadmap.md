# Roadmap

Status: Current
Authority: The list of open work. Not a record of finished work. Runtime truth lives in the code.
Last verified against code: 2026-08-23

## READ THIS FIRST — THIS FILE HAS ONE JOB

This file lists **only work that is still open**: things we want to do, could do,
or need to do. Nothing else belongs here.

**The rules are not suggestions.**

1. **When an item is done, DELETE IT.** Do not tick it off. Do not strike it
   through. Do not move it to a "completed" section. Do not write "(done)" after
   it. Delete the lines. An item that is finished has no business in a list of
   open work, and a roadmap that accumulates finished items stops being read.
2. **Never add an entry describing something you just did.** That is what
   `progress.md` is for. If you finished it, it goes in `progress.md` and it
   comes *out* of here.
3. **If you finish part of an item, rewrite the item to describe only what is
   left.** Do not annotate it with what you did.
4. **This file is not a changelog, a status report, a diary, or a design
   document.** No dates on entries. No author names. No "as of" notes. No
   history. If you want to explain a decision, put it in `progress.md` or an
   architecture doc and link to it.
5. **Every entry must be actionable and specific enough to start on.** Name the
   file, the behaviour, or the question to answer. "Improve UX" is not an entry.
6. **Deleting an item you did not finish requires a reason** written into
   `progress.md`. Silent removal of open work is worse than leaving it.

If you are an agent working in this repository: you are expected to leave this
file *shorter* than you found it whenever you complete something. Adding to it
without removing anything is only correct when you genuinely discovered new open
work.

The **Settled** section at the bottom is the one exception to "open work only".
It exists so nobody re-litigates a closed decision. Do not add finished tasks
there.

---

## P1 — Correctness and reachability

### The web build has no CI
`.github/workflows/ci.yml` runs the Godot suite only, and its path filter is
`godot/**`. Nothing guards the web build on a pull request: `npm run validate`
(TypeScript, content, docs, assets, the i18n guard) and
`npm run math:browser-smoke` are all manual today.

*Done when:* a workflow runs `npx tsc --noEmit` and `npm run validate` on pull
requests touching `src/**`, `public/**`, `tools/**` or `admin.html`. The browser
smoke needs a dev server and a Chromium, so decide separately whether it belongs
in CI or stays a local gate.

### Confirm the intended level unlock chain
On a fresh save only two of six levels are selectable (`level_99` and
`level_01`); 3–6 show as locked. That is consistent with
`unlockRequirement` in `public/data/levels/level_registry.json`, but nobody has
stated whether a child is meant to unlock strictly one at a time.

*Done when:* the intended progression is written down in `PROJECT.md` and the
registry matches it.

## P2 — Experience decisions that need making

### The post-wrong-answer input lockout is long and inconsistent
After a wrong answer the option buttons stay fully lit and tappable-looking
while input is refused, so a child who retries immediately gets silence. This is
what made the browser smoke flaky.

The "three to four seconds" this entry used to claim is not what the source
does: `MathBoard.ts:336` re-enables input at 600ms on the first miss, and
`MathChallengeScene.ts:199` dismisses at 800ms on the second. The 1500ms hold
after a *correct* answer (`MathChallengeScene.ts:183`) is the longest wait in
the flow and is deliberate. Re-measure on a device before changing any number —
what the smoke test was tripping over has not actually been identified.

*Done when:* the real duration is measured, the lockout has one deliberate value
across problem types, and the options visibly show they are not accepting input
while it runs.

### Mid-game language switching
The selector is on Login and Main Menu only. Switching inside a level would
require live re-rendering of `HUDScene`, `TouchControls`, `DialogBox` and any
open `MathChallengeScene` overlay — a scene restart is only safe outside
gameplay.

*Done when:* either a settings surface exists that is safe to restart from, or
the locale-change path re-renders live scenes and `GameEvents.LOCALE_CHANGED`
has listeners that prove it.

### `pause.theme` promises a theme switcher that does not exist
The key sits in all four string bundles and `ThemeManager` supports swapping
between `forest` and `scifi`, but no control was ever built.

*Done when:* Pause offers the switch, or the key is deleted from all four
bundles.

### Level select does not snap to rows
`ScrollList` has momentum, clamping and a peeking next row, but a flick can rest
mid-row. Snapping may read better for young players; it may also feel fighty.

*Done when:* tried both ways on a device and one is chosen.

### Wrong answers are painted in the damage colour
`MathBoard.showWrongFeedback()` fills the chosen option with
`ThemeManager.getColorNum('danger')` and flies its "Try again" text up in a
hardcoded `#ff6666`. Both shipped themes also set `wrongFx: "shake_red"`. In a
game whose point is making a six-year-old comfortable being wrong, the colour of
taking damage should not appear on a maths answer.

*Done when:* wrong-answer feedback uses an amber that is distinguishable from
the correct-answer green in luminance as well as hue, the hardcoded `#ff6666` is
gone, and red is reserved for health loss. `brand/BRAND_SYSTEM.md` §6.2 and
`brand/tokens/verify_palettes.py` specify and check this.

### Five levels, one look
All six level specs declare `"theme": "forest"` and every `level_registry.json`
entry loads the same `level1_tiles.png`. `ThemeManager` supports per-level
theming and nothing uses it — `setTheme()` is called once at boot and never
again.

`brand/tokens/` holds five ready `ThemeDefinition` files and a four-step wiring
recipe. It needs no new art: `HealthBar` falls back to generated placeholders
for missing sprite keys and `MathBoard` draws from palette colours, so the
worlds diverge visually from JSON alone.

Also unresolved in the same area: `level-spec.schema.json` enums `theme` to a
vocabulary (`forest`/`cave`/`village`/`mountain`/`sky`/`underwater`) that does
not match any `ThemeManager` id, and `level_03` (7 platforms, no hazards, no
enemies) and `level_04` (11 platforms, 1 of each) are too small to carry a
distinct world.

*Done when:* each level loads its own theme, the spec vocabulary and the theme
ids are the same words, and no two levels share a tileset.

## P3 — Content and localisation

### Four string keys are referenced by neither port
`hud.level`, `hud.level_up`, `login.delete`, `login.delete_confirm`. Either wire
them up or remove them from all four bundle files. Note that profile deletion
appears to be unimplemented in both ports, which is what the last two are for.

### Only six levels exist
`level_99` (practice) plus five real ones. More content is the main lever on how
long a child stays with the game.

### A third locale is now cheap
The engine is generic. Adding one means: a bundle in all four locations,
`LOCALES` in `src/systems/TextManager.ts`, `LOCALE_FILES` and `LOCALE_ENDONYMS`
in `godot/scripts/autoload/text_manager.gd`, an endonym, and a pass of the fit
budget in `tools/validate_i18n.mjs`.

*Watch out:* the selector is a segmented control sized for exactly two options.
Three or more needs a different pattern, and the fit budget will not catch that.

## P4 — Build and tooling

### The committed web export carries the old game name
`output/web/index.pck` is a Godot binary with `Crow` compiled in.
`godot/project.godot` is already renamed, so a re-export fixes it. Players never
see it — the browser tab title comes from the export's `index.html`, which is
correct — so this is cosmetic and internal.

*Note for whoever picks this up:* Godot 4.3 headless runs fine in a container
(`godot --headless --path godot res://tests/TestRunner.tscn` passes 61/61). The
missing piece is the export templates, not the engine.

### Web SFX are generated, not authored
`tools/gen_sfx.py` synthesizes all 15 effects procedurally and writes them to
both runtimes. They are committed and they work, but they are placeholders in
tone.

*Done when:* someone decides whether these are the shipping sounds.

---

## Settled — do not re-open

Closed decisions, kept here so they are not re-litigated. **This is not a list
of completed tasks.** Do not add finished work here.

- **The `crow_*` localStorage keys keep the old name** (`crow_profiles`,
  `crow_save_<user>`, `crow_locale`, `crow_active_user`, `crow_family_id`, the
  learner-sync keys). Renaming them would orphan every existing player's
  profile, save and learner state. The same applies to texture keys, sprite
  paths and the `crow-platformer` package slug.
- **No bundled webfont.** Icelandic needs 16 letters, all in Latin-1
  Supplement, which every font in practical use carries. The missing-glyph bugs
  came from decorative glyphs used as UI primitives, not from the language. UI
  primitives are drawn with `Graphics`/`Line2D` instead, and
  `tools/validate_i18n.mjs` enforces a Latin-1 allowlist.
- **`pause.quit` stays `Hætta`.** Changing only the Icelandic to
  `Aðalvalmynd` would leave the two locales saying different things.
- **Language names are never translated.** `English` / `Íslenska` are endonyms
  so a player stranded in a language they cannot read can still get out.
- **No flags in the language selector.** A flag names a country, not a
  language, and English has no single one.
- **The dated review documents under `docs/` still say "Crow".** They are
  historical records; rewriting them would be revisionist.
