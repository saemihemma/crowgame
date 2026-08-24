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

### `output/web/` is a hand-built artifact on the deploy path
`railway.json` -> `deploy/web/Dockerfile` copies the committed `output/web`
straight into Caddy, so **whatever is in that directory is the live game**. It is
produced by running `bash godot/tools/build_web.sh` locally and committing a
23MB pack plus a 35MB wasm. Nothing checks that it matches `godot/**`, so the
deployment silently drifted behind the source for an entire feature's worth of
work.

*Done when:* either CI rebuilds and commits (or publishes) the export when
`godot/**` changes, or `npm run validate` fails when `output/web/index.pck` is
older than the newest file under `godot/`. A staleness check is the cheap
version and would have caught this.

### `math.expl.sub` loses the English's concrete register
The English explanations deliberately use a five-year-old's words -- "8 take away
5 leaves 3" -- while the Icelandic says "8 mínus 5 gerir 3", which is the
arithmetic register. It is correct and it is what an Icelandic worksheet says,
but it is a shade more formal than the English it translates. The same applies to
`math.expl.add` ("plús" for "plus" is fine, but "gerir" for "makes" is flatter
than the English).

*Done when:* a native-speaking teacher has read the 32 `math.expl.*` strings
aloud to a child in the target age band and either kept them or replaced them.

### Nothing renders a problem's explanation
All 2908 explanations sit in the pools unread. Neither runtime displays them:
the web build reads `prompt.text` and `hint` only (`src/ui/components/MathBoard.ts`),
and the Godot port reads `prompt.text` only. `src/math/problemPhrasing.ts` exports
`localisedExplanation()` and every explanation already has a verified Icelandic
phrasing, so the content and the translation are ready for a surface that does
not exist.

*Done when:* either a post-answer surface shows the explanation, or the field is
deleted from the pools and the 32 `math.expl.*` keys come out of all four bundles.

### The Godot port never shows hints
`godot/scripts/ui/math_challenge.gd` reads `hint` only to count it for telemetry
(`hintsUsed`), never to display it. The web build shows it below the board after a
wrong answer. So a child on the Godot build gets no help after getting something
wrong, and the 86 `math.hint.*` translations are web-only.

*Done when:* the Godot math panel shows the hint after a wrong attempt, rendered
through `TextManager.tp()` with the same English fallback as the web build.

### Confirm the intended level unlock chain
On a fresh save only two of six levels are selectable (`level_99` and
`level_01`); 3–6 show as locked. That is consistent with
`unlockRequirement` in `public/data/levels/level_registry.json`, but nobody has
stated whether a child is meant to unlock strictly one at a time.

*Done when:* the intended progression is written down in `PROJECT.md` and the
registry matches it.

## P2 — Experience decisions that need making

### The on-screen controls are unverified for desktop-web mouse
`godot/scripts/ui/touch_controls.gd` shows the d-pad whenever
`OS.has_feature("web")` is true, which includes desktop browsers where the
player has a mouse. `pointing/emulate_touch_from_mouse` is enabled as the
documented fix, but it could not be confirmed: synthetic pointer input does not
reach Godot's TouchScreenButtons in headless Chromium, by Playwright mouse or by
CDP touch events. The touch path itself is covered by
`godot/tests/test_touch_controls.gd`.

*Done when:* someone clicks the d-pad with a real mouse in a desktop browser and
says whether the crow moves. If it does not, the fallback is to hide the controls
unless `DisplayServer.is_touchscreen_available()`, so desktop players are not
shown dead buttons.

### The post-wrong-answer input lockout is long and inconsistent
After a wrong answer the math board ignores input for roughly three to four
seconds while the retry feedback plays, and the duration varies by problem type.
The option buttons stay fully lit and tappable-looking throughout, so a child who
retries immediately gets silence. This is what made the browser smoke flaky.

*Done when:* the lockout has one deliberate duration, and the options visibly
show they are not accepting input while it runs.

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

## P3 — Content and localisation

### Four string keys are referenced by neither port
`hud.level`, `hud.level_up`, `login.delete`, `login.delete_confirm`. Either wire
them up or remove them from all four bundle files. Note that profile deletion
appears to be unimplemented in both ports, which is what the last two are for.

### Only six levels exist
`level_99` (practice) plus five real ones. More content is the main lever on how
long a child stays with the game.

### A third locale is now cheap, but no longer trivial
The engine is generic. Adding one means: a bundle in all four locations,
`LOCALES` in `src/systems/TextManager.ts`, `LOCALE_FILES` and `LOCALE_ENDONYMS`
in `godot/scripts/autoload/text_manager.gd`, an endonym, and a pass of the fit
budget in `tools/validate_i18n.mjs`.

*It is 239 keys now, not 71.* 168 of them are math phrasing templates. They are
short and formulaic, but a new locale is a real translation job rather than an
afternoon.

*Watch out:* the selector is a segmented control sized for exactly two options.
Three or more needs a different pattern, and the fit budget will not catch that.

## P4 — Build and tooling

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
- **`prompt.text`, `hint` and `explanation` stay canonical English.** Four
  things read them and would break if they became Icelandic:
  `tools/math_verifier.ts` recomputes every answer by parsing operands out of
  `prompt.text` and is the only independent arithmetic check;
  `src/math/problemReplayKey.ts` builds the anti-repeat key from it with literal
  tests like `startsWith('count these:')`; `buildPromptUniquenessKey` dedupes the
  pools on it; and the golden fixtures shared with the Godot parity tests compare
  it byte for byte. Localisation is a render-time overlay through the optional
  `phrasing` sibling, never a data rewrite.
- **Math phrasing parameters carry no natural language.** Numbers, the operator
  symbol, a glyph run, a comma-joined number list. Every word lives in a template
  in the bundles, so it inherits the glyph allowlist, lockstep, placeholder
  parity and fit budget. A prefixed prompt nests one template inside another
  rather than pre-rendering its inner text.
- **A phrasing derivation must agree with the problem's own answer.** Round-
  tripping a derivation through its own template proves nothing on its own --
  the matchers are generated from the templates, so two deliberate corruptions
  round-tripped 3000/3000 clean. The gate that works is arithmetic agreement with
  `answer.correct`, plus the measured operand-order invariant for the 62
  templates where `{a}`/`{b}` are the prompt's operands. See
  `tools/math_phrasing_catalog.mjs`.
- **Icelandic explanations say "gerir", not "er"/"eru".** Icelandic verb
  agreement follows the numeral -- "2 plús 3 eru 5" but "4 mínus 3 er 1" -- and
  the result is a parameter, so any agreeing verb is wrong for some values.
  "gerir" is invariant, idiomatic in teaching, and a literal rendering of the
  English "makes". Where a phrasing cannot avoid the verb, the sentence drops it
  instead ("Bara {diff} eftir!") rather than guess.
- **Plural agreement is a per-locale rule applied at render time.** A phrasing
  that inflects names the parameter that drives it (`plural`) and carries a
  `.one` sibling in every bundle; each runtime resolves the category itself.
  English inflects at 1, Icelandic at 1, 21, 31 and so on, so the resolved
  category is deliberately NOT stored in the pools -- baking English's rule into a
  locale-neutral field works only until a problem contains 21.
