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

### Confirm the intended level unlock chain
On a fresh save only two of six levels are selectable (`level_99` and
`level_01`); 3–6 show as locked. That is consistent with
`unlockRequirement` in `public/data/levels/level_registry.json`, but nobody has
stated whether a child is meant to unlock strictly one at a time.

*Done when:* the intended progression is written down in `PROJECT.md` and the
registry matches it.

## P1.5 — The math experience loop

The loop being built: teach → try → win → celebrate → miss → comeback →
level up → new world → one more. Kid-safe rules bound everything here:
rewards only ever add (no streaks, no timers, nothing to protect), game
progress never gated by math level, one big celebration per encounter,
teaching skippable, no dark patterns.

### Tune the ladder against real play, not intuition
The admin session report tags accuracy against the 70-85% sweet spot. After a
week of family play: above 85% raise the at-level/stretch share, below 70%
raise comfort, low comeback rate shorten the review gap. One knob at a time,
one week per change.

*Done when:* two consecutive weekly reports sit inside the sweet spot with at
least one step-up per early session and frustration flags under 10%.

## P2 — Experience decisions that need making

### The on-screen controls have no automated gate
Touch has positive evidence and no gate; mouse has neither.

*Touch:* held CDP touches on the d-pad move the world in the exported build,
measured twice at 0.998 change — the same magnitude as a keyboard walk — and real
DOM touch events are confirmed to reach the canvas. So it works. What does not
exist is a repeatable assertion: a sequence of held touches contaminates itself,
because once the crow reaches the owl the encounter overlay opens and captures
input, after which every later probe reads as dead including a keyboard control.
A gate needs a fresh level per probe, or a level with no owl near the spawn.

*Mouse:* untested. `godot/scripts/ui/touch_controls.gd` shows the d-pad whenever
`OS.has_feature("web")` is true, which includes desktop browsers where the player
has a mouse, and `pointing/emulate_touch_from_mouse` is enabled as the documented
fix but has never been confirmed — Playwright's synthetic mouse does not reach a
TouchScreenButton, which is a harness limitation and not evidence either way.

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

### A gated "padlock owl" variant that asks for more than one answer
The baseline owl asks exactly one problem. `problemCount` is already per-NPC
config in `npc_registry.json` and both ports' components loop until it is met,
so the remaining work is content and design, not plumbing: a visually distinct
NPC variant, a registry entry with `problemCount` 2-3 and a bigger reward, and
a decision about where it appears (level gates? bonus areas?). The
multi-problem UI (progress header, alternate-domain follow-ups) stays dormant
at the baseline but keeps working for any NPC that raises the count.

### Multiplication and division need a fate decision
650 authored problems sit in domains the owl never serves — not in its
`problemTypes`, and with almost no content below step 3 (division's lowest
band starts at difficulty ~2). Either author step 0-2 on-ramps and add them to
the rotation for older kids, or park them explicitly in Settled.

### Nothing ever chooses a theme
`ThemeManager`'s own docstring says "Each world/level can specify a theme", and
that was never wired. Boot sets `forest` and nothing else ever calls `setTheme`
— the only other caller was a toggle in the Pause menu, which has been removed
because a theme is a property of a place, not a setting. So `theme_scifi.json`
ships and is unreachable in both ports.

*Done when:* either level specs carry a `theme` that the level loader applies (the
intended design, and the reason the sci-fi art exists), or `theme_scifi.json` and
the second-theme support come out together.

### A sound setting exists but a volume one does not
Pause offers sound on/off, which is what a parent in a waiting room reaches for.
The underlying API in both ports has separate master, music and SFX volumes and
nothing exposes them, so "quieter" is not reachable — only "silent".

*Done when:* someone decides whether a child's game needs more than a mute. If it
does, note the Pause panel is sized for four rows and a slider is a different
control from a button.

### The trophy shelf has no heading
`trophy.title` ("My badges" / "Merkin mín") was added to all four bundles with
the shelf but nothing ever drew it — the new dead-key guard caught it on its
first merge. The key is deleted rather than wired up, because adding a heading
changes the main menu's layout and that belongs to whoever designed the shelf.

*Done when:* either a heading is drawn above the badge row and the key comes
back with it, or the shelf is deliberately headingless and this entry goes.
Note the main menu is already tight: the language selector's width is measured
against the title ending at x 636.

### `DialogBox` and `DialogComponent` are dead code carrying English
Nothing calls `showGreeting`, `showSuccess` or `showFailure`, so the dialogue
never reaches the screen — the owl goes straight to the math overlay, whose
greeting comes from `math.greeting_*`. But `DialogComponent.buildLines()` holds
hardcoded English ("Hoo-hoo! Hello there, little crow!"), the owl's
`npc_registry.json` entry still configures a `dialog` component, and `DialogBox`
is one of the seven `THEME_CHANGED` subscribers. It reads exactly like an
untranslated surface and is not one, which cost a reviewer real time.

*Done when:* either the dialogue path is wired up and its lines move into the
bundles, or `DialogBox`, `DialogComponent` and the registry's `dialog` entry are
deleted together. Note the web build has no hardcoded-string guard at all — the
Godot port's `check_hardcoding.py` has no web counterpart, which is why this sat
unnoticed.

### Only six levels exist
`level_99` (practice) plus five real ones. More content is the main lever on how
long a child stays with the game.

## P4 — Build and tooling

### Code-drawn UI stand-ins need a real art pass
Several load-bearing math-experience surfaces render with primitives drawn in
code because no authored art exists for them: the trophy-shelf badges
(sprout / leaf / flower / star) on both main menus, the progress pips in the
math overlay, the golden-problem frame, the recap panel (plain themed
rectangles), and the celebration bursts (engine particles). They are
deliberately glyph-free and work, but they read as placeholders next to the
character art. This is the standing contingency for any pixel-art / UI-asset
pass: replace these surfaces first, in both ports, without touching the
tuning-driven logic that decides when they appear (`math_tuning.json`
`trophies.tierSteps` and `golden.rate`).

*Done when:* an artist has supplied sprite versions — or explicitly blessed
the drawn primitives as the shipped look — for badges, pips, the golden
frame, and the recap panel, wired in both `src/` and `godot/`.

### Web SFX are generated, not authored
`tools/gen_sfx.py` synthesizes all 16 effects procedurally and writes them to
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
- **Flags in the selector, beside the endonym, drawn not emoji.** A flag names
  a country and not a language, and English has no single one -- so the flag is
  an extra affordance for a child who cannot read yet, never the identifier. The
  word stays, and stays untranslated. 🇺🇸 was chosen for English over 🇬🇧 as the
  owner's call.
  They are vector geometry (`src/ui/components/FlagIcon.ts`,
  `godot/scripts/ui/flag_icon.gd`), not emoji, for the same reason the PIN dots
  and the tick are: a flag emoji is a regional-indicator pair far outside
  Latin-1, Windows ships no flag glyphs so Chrome there renders it as the
  letters "US"/"IS", and the Godot export's bundled font has no emoji at all --
  which is exactly the tofu this whole localisation pass started from.
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
- **A fit-budget entry whose placeholder takes a WORD must name its fillers.**
  `pause.theme` and `math.step_up` are filled with a theme name and a domain
  name, and the budget's `88` stand-in reported a comfortable fit for strings
  twice the measured width. Boxes like these carry a `fill` list in
  `tools/validate_i18n.mjs` so the widest real substitution is what gets
  measured.
- **Plural agreement is a per-locale rule applied at render time.** A phrasing
  that inflects names the parameter that drives it (`plural`) and carries a
  `.one` sibling in every bundle; each runtime resolves the category itself.
  English inflects at 1, Icelandic at 1, 21, 31 and so on, so the resolved
  category is deliberately NOT stored in the pools -- baking English's rule into a
  locale-neutral field works only until a problem contains 21.
