# Roadmap

Status: Current
Authority: The list of open work. Not a record of finished work. Runtime truth lives in the code.
Last verified against code: 2026-08-25

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

### Tune the ladder against real play, not intuition
The loop is now built and only the play is missing. `/api/v1/admin/ladder-tuning`
reads the last seven days and answers with one knob to move -- which file, from
what to what, and the measurement behind it -- or with a refusal naming exactly
what the sample is short of. The decision is a pure function in
`server/src/lib/ladderTuning.ts`, pinned by nine tests, and the admin page
renders it under the charts.

It refuses today, and will keep refusing until roughly 200 answers spread over
four separate days exist, because a rate over one enthusiastic afternoon is noise
and a knob moved from noise leaves a system nobody can reason about. Nothing here
is waiting on code.

What remains is the tuning itself, which takes calendar time: play a week, apply
the one change it names, play another, repeat. Note that if it recommends the
review gap, that is `IMMEDIATE_REVIEW_MIN_GAP`/`MAX_GAP` in
`learner_state_manager.gd` -- a Tier-1 constant, so changing it means
regenerating the golden parity fixtures, and the recommendation says so.

*Done when:* two consecutive weekly reports sit inside the sweet spot with at
least one step-up per early session and frustration flags under 10%.

### Sessions are derived from math attempts, so math-free play is invisible
The admin overview splits attempt timestamps on a 30-minute gap to get session
counts and lengths. A child who runs and jumps without meeting an owl leaves no
trace in it. A lightweight client heartbeat (session start + a ping every few
minutes, batched into the existing API) would make session length honest for
all play, not just math play.

*Done when:* the overview's session numbers come from heartbeats, and the
`derivedFromAttempts` label is gone from `/api/v1/admin/overview`.

### Four grade milestones are approximate alignments, not sourced scope
The Icelandic grade mapping (docs/GRADE_EXPECTATIONS.md) anchors addition,
subtraction, counting, multiplication and division milestones to official
sources (aðalnámskrá end-of-grade-4 criteria, MMS Sproti per-grade scope). The
comparison, number_sequence and pattern_matching milestones are marked
`"basis": "approx"` in `godot/data/curriculum/grade_expectations.json` because
no official number-range anchor exists for them — they were placed by
judgement against the Sproti topic lists. Contingency: a practising
grunnskólakennari reviewing that one JSON file (eight domains, sixteen rows)
would either confirm or correct them in minutes. The grade-2 content ceiling
is closed: the ladders now run to grade-4 material (3- and 4-digit
add/subtract by regrouping load, the full table-order multiplication ladder,
fact-family division, ordering and skip counting into the thousands — see
docs/MATH_AUTHORING_STANDARDS.md). The `approx` rows now also include the
number_sequence grade-3/4 milestones.

*Done when:* every milestone's `basis` is `law`/`curriculum`/`material`, or an
educator has signed off the `approx` rows in the JSON's provenance notes.

### Division with remainders needs a new answer mode
The MCQ answer format is a single number, so "deiling með afgangi" (Sproti 4)
cannot be asked honestly — division content stops at exact division. A
quotient+remainder answer widget (or a two-part question) unlocks it.

*Done when:* a remainder answer mode exists and a `division` band authored
with remainders passes the materialize review gate.

## P2 — Experience decisions that need making


### The on-screen controls are gated on geometry, not on input
`godot/tests/test_touch_gates.gd` now checks every pad at four real device
viewports for the 88px target floor (B3), the 32px safe area (B4), thumb-corner
placement (B10) and non-overlap. That is what caught nothing before: the pads
were laid out from a fixed 960x540 while the viewport is `expand`, so on any
other aspect they detached from the corners and floated in the level.

What is still ungated is whether a press actually *arrives*.

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

*Done when:* someone clicks a pad with a real mouse in a desktop browser and says
whether the crow moves. If it does not, the fallback is to hide the controls
unless `DisplayServer.is_touchscreen_available()`, so desktop players are not
shown dead buttons.

### The five tilesets are generated placeholders
Each world has its own tileset and no two levels share a ground, but the five
sheets come out of `tools/gen_tilesets.mjs` and none of them is finished art.
`brand/ASSET_MANIFEST.md` carries the per-world grades (5.5 to 6.5 out of 10),
what is wrong with each, the geometry contract and the replacement steps.

Redrawing them by hand is the highest-value art work available.

*Done when:* every entry in `public/data/tilesets/tileset_manifest.json` reads
`"source": "authored"`, and `tools/gen_tilesets.mjs` can be deleted.

### The compiler places three tiles and emits an empty decoration layer
`tools/level_compiler.ts` only ever writes GIDs 1, 2 and 3 — ground surface,
ground fill, platform — into the ground layer. Indices 3-15 of every tileset are
unused, and the `decoration` layer is created full of zeros and never populated.

Two consequences worth fixing together. A platform run is the same tile repeated,
so a 3-wide ledge has no left or right cap and reads as a slab. And because there
is one tile per role, tile texture has to stay non-figurative or it tiles into
wallpaper — which means distinctive marks have nowhere to live.

*Done when:* the compiler selects left/middle/right caps for platform runs, and
scatters decoration tiles into the layer it already emits.

### `level1_tiles.png` is loaded but never selected
It is in the tileset manifest and BootScene loads it, but no compiled map names
it: `GameScene.loadTiledLevel()` resolves a tileset by the name the map carries,
and every map now names its world tileset. It is 32x64, two tiles, and predates
the current compiler. `LevelRegistryEntry.tilesetImages` is the same story — the
field is declared in `src/utils/Types.ts` and read by nothing.

*Done when:* both are removed, or something actually uses them.

### `theme_forest` and `theme_scifi` are kept alive only by the Godot tests
`godot/tests/test_theme_roles.gd` and `test_theme_swap.gd` assert on the
`forest` and `scifi` ids by path. Once the five world themes land in Godot those
two skins have no other reason to exist.

*Done when:* the tests assert on two world ids instead, and the legacy skins are
deleted.

### The Godot build is missing everything the Phaser prototype proved
Godot is the only runtime now, so this is not a parity gap — it is the actual
backlog. A capture of `level_01` shows a flat `#87CEEB` sky, the forest tileset,
and a HUD reading `Lives: *** / Coins 15 / Owls 3` in plain yellow text.

Missing: the five world themes and per-level selection, the themed sky, the five
tilesets (the PNGs are there; nothing loads them), the feel pass, the
wrong-answer choreography, the dynamic maths-board layout, the three-pod HUD and
owl ring, the streak, and the one-answer owl roster — `owl_probe` still solves
two problems.

`brand/PRODUCTION_PLAN.md` §2a has the table and the order. Themes go first.

*Done when:* captures show five visibly different worlds and `run_tests.sh`
still passes.

### The maths board is themed by colour only, not by material
Every theme file already declares `mathBoard.frameSprite`, `mathBoard.bgSprite`
and `mathBoard.optionSprite`, and none of them has ever had a texture behind it.
`MathBoard` draws the panel and the option buttons with `Graphics` from the
palette, so a world changes the board's *colour* and nothing else. Emberwood and
Geyserworks should not be the same rounded rectangle in different browns.

`brand/BRAND_SYSTEM.md` §8.3 owns the intent: the board is made of the world's
material — bark, crystal, candy, iron, sky-stone — while its geometry, button
grid and timings stay identical in all five. Skin changes, layout never does.
`brand/ASSET_MANIFEST.md` P4 lists the files.

*Watch out:* the board is no longer a fixed `520x280`. It measures its question,
options and hint and grows to fit, so on a two-line prompt it is close to 380
tall. **The frame has to be a true nine-slice** — a fixed-size PNG will stretch
and smear its corners. That means the asset is a nine-slice source plus the
border insets, and `MathBoard.drawBoardBackground()` needs to draw a
`NineSlice` game object when a texture exists and keep the `Graphics` path as
the fallback, the same way `HealthBar` already falls back for its icons.

*Done when:* each world's board is visibly made of that world's material, the
frame survives a two-line prompt without distortion, and replacing one is a PNG
swap plus insets in the theme file.

### The HUD has states no screenshot has ever seen
`tools/theme_screenshots.mjs` now rescues an owl, so the filled ring is covered.
Still uncovered: a lost heart (needs damage), the streak flame at 3+ (needs two
owls answered perfectly in sequence), and the ability slots (needs an ability
granted). Those are three designed states with no visual evidence behind them.

*Done when:* the harness can drive damage and a multi-owl streak, or those states
are checked some other way and the check is written down.

### Apex hang is blocked by the motion parity contract
The jump would feel more generous with reduced gravity near the top of the arc,
which `brand/BRAND_SYSTEM.md` §2.4 calls for as the `apex` hold. It was left out
of the feel pass deliberately: `godot/tests/test_motion_parity.gd` asserts the
Godot port matches golden fixtures generated from the web motion model
(`tools/golden/gen_motion_fixtures.ts`), and that model has one constant gravity.
Changing it on the web side alone silently breaks parity, and Godot cannot be
exercised from the container this was written in.

*Done when:* apex damping exists in the shared model, both runtimes implement it
and the fixtures are regenerated — or the idea is dropped on purpose.

## P3 — Content and localisation

### Lessons for the concepts, and only some of the practice
`docs/MATH_CONCEPT_LADDER.md` ships 38 lessons over 40 concepts, but a lesson is
authored copy and the pools are generated. When a concept is re-cut, split or
its step range moved, the lesson's numbers stop matching the rung it teaches.
`tools/validate_math_concepts.mjs` checks each card's arithmetic against its own
picture; nothing yet checks that a lesson's numbers sit inside its concept's
band. Worth adding when the ladder next moves.

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

### The trophy shelf has no heading
`trophy.title` ("My badges" / "Merkin mín") was added to all four bundles with
the shelf but nothing ever drew it — the new dead-key guard caught it on its
first merge. The key is deleted rather than wired up, because adding a heading
changes the main menu's layout and that belongs to whoever designed the shelf.

*Done when:* either a heading is drawn above the badge row and the key comes
back with it, or the shelf is deliberately headingless and this entry goes.
Note the main menu is already tight: the language selector's width is measured
against the title ending at x 636.

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

- **The committed Godot export is checked by CONTENT, never by timestamp.** git
  does not preserve mtimes, so "is the pack older than godot/**" is noise in a
  fresh clone. `godot/tools/build_web.sh` records a sha256 of its inputs into
  `output/web/build_fingerprint.json` and `npm run validate` recomputes it.
  Content addressing (`index.<buildId>.pck`) busts caches and does NOT catch
  staleness: an export built from old sources still gets a valid name.
- **Answer-feedback pacing lives in `data/tuning/math_tuning.json`.** It was
  hardcoded in one port and in `ui_tuning.json` in the other, so the two
  disagreed about how long a child waits after a miss.
- **A held control must look held.** The options dim to 0.45 while input is
  locked out. Use `self_modulate`, not `modulate` -- the focus highlight owns
  `modulate` and will otherwise leave the focused option lit.
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
