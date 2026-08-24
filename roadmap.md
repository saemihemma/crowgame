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
