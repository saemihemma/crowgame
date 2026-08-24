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

### The maths questions themselves are still English
Icelandic is complete for every menu, label and greeting, but the problems a
child actually reads are not. 2331 of 3000 prompts contain English words --
"Quick check: 1 + 2", "What is 3 + 4?", "Complete: 5 - 2 = ?". A child playing in
Icelandic gets an Icelandic shell around English questions, which for a five- to
seven-year-old is the part that matters most.

It is far more tractable than the raw count suggests: there are 206 distinct
phrasings and **the top 20 cover 87%** of them. The work is translating a
templated phrase list, not 2331 strings.

*The blocker is a schema decision, not the translation.* Prompts live at
`prompt.text` in `public/data/math/*.json` (mirrored under `godot/data/math/`),
and those pools are covered by `tools/validate-content.ts`, `tools/math_verifier.ts`,
duplicate-prompt checks and the golden fixtures the Godot parity tests share.
Options: a per-locale sibling field (`prompt.text_is`), a parallel pool per
locale, or generating prompts from a template id plus operands at runtime. The
last is the only one that does not double the content and keeps the arithmetic
checks meaningful.

*Done when:* a locale decision is recorded in `MATH_SYSTEM_ARCHITECTURE.md` and
the top-20 phrasings render in Icelandic in the exported build.

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

### Confirm the intended level unlock chain
On a fresh save only two of six levels are selectable (`level_99` and
`level_01`); 3–6 show as locked. That is consistent with
`unlockRequirement` in `public/data/levels/level_registry.json`, but nobody has
stated whether a child is meant to unlock strictly one at a time.

*Done when:* the intended progression is written down in `PROJECT.md` and the
registry matches it.

## P1.5 — Port parity

### The Godot math port has drifted behind the web ladder
Four related gaps, best fixed together:
`godot/data/math/problems_curriculum.json` is a stale copy of the web pool and
nothing guards the sync (add a check to `npm run validate` or copy at
materialize time); the GDScript learner model (`godot/scripts/math/*.gd`)
still runs the old promotion/demotion/ELO tuning; the golden parity fixtures
(`godot/tests/fixtures/math_fixtures.json`) are pinned to that old behavior,
so regenerating them via `npm run godot:gen-math-fixtures` will break
`test_math_parity.gd` until the GDScript is ported to match; and
`godot/scripts/ui/math_challenge.gd` renders MCQ options in data order — safe
for the regenerated pool (shuffled at the source) but not for the
hand-authored easy/dataset/gaps pools, which keep their biased order. Port the
ladder, regenerate fixtures, sync the data, and add a render shuffle in the
same change.

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

### Visual and richer worded prompts
Addition and subtraction now carry two word-problem shapes each (berries,
birds), gated to steps 3+. Still open: more story families and objects so the
wording doesn't wear out, worded shapes for comparison and sequences, and
visual prompts via the unused `prompt.assets` field (picture-group addition in
the spirit of counting's dot strings). Every new worded shape needs a matching
pattern in `src/math/wordedArithmetic.ts` — that table is what keeps steps,
traits, and replay keys honest.

### Misconception tags are authored but nothing consumes them
Every problem carries `misconceptionTags` (off-by-one, counting-back errors,
…) and MCQ distractors are constructed, yet the runtime never looks at *which*
wrong option a child picked. Mapping distractor → misconception in
`ELOUpdateManager` would let review items target the actual confusion instead
of just the skill, and let hints speak to the specific error.

### Response time is recorded but unused as a learning signal
`responseMs` is now honest time-to-first-answer, but nothing distinguishes
fluent-correct from slow-correct. At fact-practice steps, fluency (fast and
right) is the real mastery bar — consider a soft fluency component in the
promotion gate, and retune the frustration `responseTimeSpike` threshold in
`LearnerStateManager.buildSummary` against real session data.

### Within-lane selection is uniform random and problem ELO never learns
`ELOAwareStrategy` picks uniformly inside the chosen lane; the effective
selection ELO it computes is unused. Weighting lane candidates toward the
learner's edge would sharpen targeting inside a step. Relatedly,
`ProblemPoolManager.updateProblemRating` records per-problem success rates but
never adjusts `eloRating` — either calibrate item difficulty from that
telemetry or rename the method to what it does.

### Review backlog has no decay or cap policy
`day_1`/`day_3`/`day_7` review items assume steady play. A child who skips a
week comes back to a stacked, all-due backlog that crowds the 20-25% review
lane for a long stretch. Decide a cap per domain and a staleness policy in
`LearnerStateManager.applyReviewUpdate` / `getDueReviewItems`.

### Difficulty scalar and curriculum step are two separate scales
`difficulty` comes from authoring band ELO targets, `curriculumStep` from the
structural derivation in `tools/math_curriculum.ts`; the owl's difficulty band
filter sits on the first while the ladder climbs the second, which is how
comparison got stalled before the band was widened. Unify: derive `difficulty`
from the derived step (one source of truth), or drop the difficulty filter
from the adaptive path once step data is fully trusted.

### Multiplication and division need a fate decision
650 authored problems sit in domains the owl never serves — not in its
`problemTypes`, and with almost no content below step 3 (division's lowest
band starts at difficulty ~2). Either author step 0-2 on-ramps and add them to
the rotation for older kids, or park them explicitly in Settled.

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
