# Roadmap

Status: Current
Authority: The list of open work. Not a record of finished work. Runtime truth lives in the code.

## READ THIS FIRST — THIS FILE HAS ONE JOB

This file lists **only work that is still open**: things we want to do, could do,
or need to do. Nothing else belongs here.

**The rules are not suggestions.**

1. **When an item is done, DELETE IT.** Do not tick it off. Do not strike it
   through. Do not move it to a "completed" section. Do not write "(done)" after
   it. Delete the lines. An item that is finished has no business in a list of
   open work, and a roadmap that accumulates finished items stops being read.
2. **Never add an entry describing something you just did.** That is what the
   commit message is for. If you finished it, it comes *out* of here and the
   record of it is in git history.
3. **If you finish part of an item, rewrite the item to describe only what is
   left.** Do not annotate it with what you did.
4. **This file is not a changelog, a status report, a diary, or a design
   document.** No dates on entries. No author names. No "as of" notes. No
   history. If you want to explain a decision, put it in the commit message or
   an architecture doc and link to it.
5. **Every entry must be actionable and specific enough to start on.** Name the
   file, the behaviour, or the question to answer. "Improve UX" is not an entry.
6. **Deleting an item you did not finish requires a reason** written into the
   commit that removes it. Silent removal of open work is worse than leaving it.

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

### Division with remainders: two blockers, and neither is the UI
"Deiling með afgangi" is Sproti 4 material and division content stops at exact
division. Scoped properly, because a first look assumed the hard part was a
two-part answer widget and it is not:

**Already there.** `forceDivisible: false` is a template flag the generator
honours (`math_authoring.ts`), so producing non-divisible pairs needs no
generator work. And the maths board already stringifies every option
(`b.text = str(options[value_index])`, and grading compares strings), so an
option of `"3 og 2 í afgang"` renders and grades today with no UI change at all.

**The two real blockers.**

1. `tools/math_verifier.ts` assumes exact division everywhere it evaluates a
   prompt -- `c / a`, `c / b` -- so a remainder prompt derives a non-integer and
   its traits come out wrong. That file is what the golden fixtures compare byte
   for byte, so this is a Tier-1 change: the verifier, the fixtures, and a
   re-materialize of all 4,039 problems.
2. `reviewMaterializedMathBatches` gates on
   `answer.mode !== 'mcq' || !options.includes(correct as number)`, so any new
   mode fails the review gate as an option error until the gate knows the shape.
   `math-problem.schema.json`'s mode enum needs the new value too.

*Done when:* the verifier evaluates `a ÷ b` with a remainder, the review gate
accepts the new mode, a `division` band authored with `forceDivisible: false`
passes materialize, and the golden math fixtures are regenerated.

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

*Mouse:* no longer a question, because the pads are no longer there. Owner
playtest: a desktop PC got the five-button thumb gamepad laid over the level.
`TouchControls.supported()` now asks `DisplayServer.is_touchscreen_available()`
alone, and `pointing/emulate_touch_from_mouse` is off — it had to be, because it
is an input of that same call and made the engine answer "yes, touch" on any
machine with a mouse. Confirmed in a browser both ways: pads present under touch
emulation, absent without.

*Done when:* the touch half above has a repeatable assertion. The mouse half is
closed.

### The five tilesets are generated placeholders
Each world has its own tileset and no two levels share a ground, but the five
sheets come out of `tools/gen_tilesets.mjs` and none of them is finished art.
`brand/ASSET_MANIFEST.md` carries the per-world grades (5.5 to 6.5 out of 10),
what is wrong with each, the geometry contract and the replacement steps.

Redrawing them by hand is the highest-value art work available.

*Done when:* every entry in `godot/data/tilesets/tileset_manifest.json` reads
`"source": "authored"`, and `tools/gen_tilesets.mjs` can be deleted.

### Reduced gravity at the apex is an unmade design decision, not a blocked one
An earlier version of this entry said the port had "constant gravity and no input
grace". Half of that was wrong: coyote time and the jump buffer have always been
in `player_motion.gd`, read from `player_base.json`, and pinned by
`test_motion_parity.gd`.

The squash and stretch §2.4 asks for is now in too, as scale on the pose the game
already has -- rise, apex, fall and the three-beat landing (squash, overshoot,
settle), all tuned from `player_base.json`'s `feel` block. That is the whole of
what §2.4 specifies as code. `jump_rise`, `apex` and `fall` are listed there as
sprite states as well, and there is no crow art for any of them: the only frames
that exist are a one-frame idle and a nine-frame walk. Those belong to the art
pass, not here.

What is genuinely open is whether GRAVITY should be reduced near the apex on top
of the shape change. Note that §2.4's `apex` is an animation state held while
`|vy| < 60`, not a gravity scale -- the physics reading is an interpretation
nobody has committed to, and `PlayerMotion` is parity-locked, so committing to it
means the same change in `tools/golden/gen_motion_fixtures.ts` and regenerated
fixtures.

*Done when:* somebody plays it with the shape change alone and says whether the
jump still wants more float -- or the idea is dropped, because shape may well
have been what "floaty" meant.

### Five board materials are wired and undrawn
`math_challenge.gd::_board_face()` now reads the active world's
`mathBoard.frameSprite` before the shared `board_panel` slot, and falls back to
the drawn `StyleBoxFlat` when neither has art -- so dropping a PNG into the
registry under the name a theme already declares changes that world's board and
nothing else. It is a nine-slice (`StyleBoxTexture` with texture margins), which
is what the growing board needs: it measures its question and can reach ~380
tall, and a fixed-size PNG would smear its corners.

`brand/BRAND_SYSTEM.md` §8.3 owns the intent -- bark, crystal, candy, iron,
sky-stone, with the geometry, button grid and timings identical in all five.
`brand/ASSET_MANIFEST.md` P4 lists the five files. This is now purely an art
dependency; there is no code left to write.

*Done when:* the five frames exist and each world's board is visibly made of that
world's material.

### The HUD's uncovered states are covered, and found two bugs
`godot/tools/capture.sh` now has `hud-hurt`, `hud-streak` and `hud-ability`
variants, driven through the game's own entry points (`Game.hurt_player`,
`EventBus.math_answer_submitted`, `EventBus.ability_granted`) rather than by
writing to the HUD, so a shot is evidence about a state the game can reach.

The first run of them showed a lit streak with no flame on the ring at all, and
"Double Jump" printed across the jump button. Both are fixed and both are now
arithmetic assertions in `godot/tests/test_hud_pods.gd`, which is the kind of
check that would have caught them without a renderer.

What is still uncovered is the DEATH and respawn sequence, and the completion
screen with a full owl ring rather than an empty one -- `complete` stages the
overlay but not the state behind it.

*Done when:* those two are variants too, or are checked some other way and the
check is written down.

## P3 — Content and localisation

### Visual and richer worded prompts
Addition and subtraction now carry two word-problem shapes each (berries,
birds), gated to steps 3+. Still open: more story families and objects so the
wording doesn't wear out, worded shapes for comparison and sequences, and
visual prompts via the unused `prompt.assets` field (picture-group addition in
the spirit of counting's dot strings). Every new worded shape needs a matching
pattern in `math-kernel/math/wordedArithmetic.ts` — that table is what keeps steps,
traits, and replay keys honest.

### Review items target the skill, not the confusion
The hint half is done: `math_misconception.gd` reads a problem's
`misconceptionTags` and names a miss when the arithmetic identifies it, so a
child who was one away hears about being one away. `math_challenge.gd` shows that
instead of the generic authored hint.

What is still open is the queue. `_apply_review_update` schedules a review item
per (domain, skill), so two children who miss the same problem for opposite
reasons -- one counting back wrong, one slipping a place value -- get the same
review. Carrying the identified misconception onto the review item would let the
scheduled return target the confusion.

*Done when:* a review item carries the misconception it was born from, in both
ports, and the selector prefers a problem that can reproduce it. Note this one is
a snapshot shape change in `learner_state_manager.gd`, which is parity-locked, so
it needs the same field in `math-kernel/systems/LearnerStateManager.ts` and
regenerated golden fixtures -- which is why the hint half went first.

### Response time is recorded but unused as a learning signal
`responseMs` is now honest time-to-first-answer, but nothing distinguishes
fluent-correct from slow-correct. At fact-practice steps, fluency (fast and
right) is the real mastery bar — consider a soft fluency component in the
promotion gate, and retune the frustration `responseTimeSpike` threshold in
`LearnerStateManager.buildSummary` against real session data.

### Item difficulty is not calibrated, and cannot be calibrated on the client
Within-lane selection is no longer uniform: `ELOAwareStrategy` now leans toward
the candidate nearest the learner's edge with a wide softmax
(`selection.withinLaneEloSpread`), so the effective selection ELO it computes is
finally used for something. Deliberately wide -- `tools/sim_learner_journey.ts`
measures a thriving child at 517 distinct problems against a floor of 450, and a
greedier temperature spends that margin.

`updateProblemRating` is renamed `recordProblemOutcome`, because that is what it
did: it counted attempts and a success rate and never touched `eloRating`. It was
not made true, because the client is the wrong place for it -- the ratings map is
rebuilt on every boot and never saved, and a child answers perhaps fifty problems
out of 3,736 in a session, so nearly every entry would calibrate from zero or one
observation.

What is open is the real version. Every attempt already reaches the API with its
problem id and outcome, so the observations exist across children; nothing reads
them back as difficulty.

*Done when:* an admin surface beside `/api/v1/admin/ladder-tuning` reports which
authored problems are measurably harder or easier than their band claims, with
enough observations behind each to be worth acting on.

### Difficulty and curriculum step are two scales, and one of them is a rail
`difficulty` comes from an authoring band's ELO target; `curriculumStep` comes
from the structural derivation in `tools/math_curriculum.ts`. The owl's band
filter sits on the first while the ladder climbs the second, which is how
comparison stalled before its band was widened.

**Dropping the band filter from the adaptive path is NOT available**, which cost
an attempt to find out. It measurably helps -- `tools/sim_learner_journey.ts` put
a thriving child at 579 distinct problems instead of 517 -- and then
`reviewMaterializedMathBatches` fails it: the selector smoke counts a problem
outside the owl's `difficultyRange` as a `selectorCapBreach` (7 of them), and its
`recentWindowFallbackPreserved` probe is built on `impossibleOptions` that are
only impossible *because* the band filter exists. That gate is a deliberate
statement that the band is a safety rail on the adaptive path, not decoration,
and 62 more distinct problems is not worth removing a rail.

So the remaining option is the other one: derive `difficulty` FROM the derived
step, so the two scales cannot disagree in the first place and the rail and the
ladder become the same rail.

*Done when:* `difficulty` is a function of `curriculumStep` in the authoring
pipeline, every pool is re-materialized through it, and the golden math fixtures
are regenerated -- problem ELO is assigned from `difficulty`, so this moves
Tier-1 numbers and cannot be done piecemeal.

### A gated "padlock owl" variant that asks for more than one answer
The baseline owl asks exactly one problem, and every dial that makes one owl
different from another is on the owl: `problemCount`, `difficultyRange` and
`problemTypes`, documented in `npc_registry.json`'s own `fields` block. So a new
variant is a registry entry plus the `npc_id` a level spawns — no code change.
What is left is content and design: a visually distinct sprite, a bigger reward,
and a decision about where it appears (level gates? bonus areas?). The
multi-problem UI (progress header, alternate-domain follow-ups) stays dormant at
the baseline but keeps working for any NPC that raises the count.

### Multiplication and division reach a child late
Both are served now: they are in every owl's `problemTypes`, they unlock off the
accuracy gate, and `tools/sim_learner_journey.ts` measures a thriving child
unlocking multiplication at attempt 44 and division at 179, with both offered on
the next question after unlocking. (An earlier version of this entry claimed they
were "not in problemTypes". That was never true.)

What remains is pace. Both plateau around step 8 of 14 and 9 of 15 even after
4000 problems, because their ELO grows only from their own attempts and they open
late in a journey. `domainWeights` in `math_tuning.json` is the dial, and
`/api/v1/admin/ladder-tuning` is the instrument that should decide where to set
it -- from real play rather than from a simulation whose success rates are
stipulated.

*Done when:* a real week of play says the pace is right, or says which way to
move the weights.

### The second lap has never been played by a person
`level_06`--`level_08` were authored by walking a motif sequence rather than by
typing coordinates, so their geometry follows from the crow's measured jump
envelope and both guards pass: every standable cell is reachable and nothing
spawns inside a tile. What no guard can tell us is whether the three of them are
any *fun* -- whether the chasm stepping-stones read as a decision, whether the
single-tile hops are too tight for a six-year-old, whether a summit is worth
climbing. Nine levels is also not a finish line; content stays the main lever on
how long a child keeps playing.

*Done when:* a child has played 06 through 08 and someone has watched, and
either the motifs are kept or the walker's constants change.

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

### The SFX are generated, not authored
`tools/gen_sfx.py` synthesizes every effect procedurally. They are committed and
they work, but they are placeholders in tone.

The brief now exists: `brand/SOUND_DESIGN.md` lists every moment in the game,
which file fires it, and how it should sound, and the swap procedure is copying
a file over the old one — no code, manifest or registry change. So this is a
commission, not an engineering task.

*Done when:* someone decides whether these are the shipping sounds, and if not,
whose they are.

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
- **The trophy shelf is deliberately headingless.** Every badge already carries
  its own domain label underneath it, so a heading would be the one item on that
  row that names nothing -- and the row is anchored to the bottom strip under the
  buttons, where it reads as a status shelf rather than a titled section. The
  `trophy.title` key stays deleted. The band is 84px and a badge plus its label
  already fills it, so adding one would also have to move the menu.
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
  They are vector geometry (`godot/scripts/ui/flag_icon.gd`), not emoji, for
  the same reason the PIN dots
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
  `math-kernel/math/problemReplayKey.ts` builds the anti-repeat key from it with literal
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
