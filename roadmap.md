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
   commit message is for. If you finished it, it goes in git history and it
   comes *out* of here.
3. **If you finish part of an item, rewrite the item to describe only what is
   left.** Do not annotate it with what you did.
4. **This file is not a changelog, a status report, a diary, or a design
   document.** No dates on entries. No author names. No "as of" notes. No
   history. If you want to explain a decision, put it in the commit message or
   `ARCHITECTURE.md` and link to it.
5. **Every entry must be actionable and specific enough to start on.** Name the
   file, the behaviour, or the question to answer. "Improve UX" is not an entry.
6. **Deleting an item you did not finish requires a reason** written into the
   commit message. Silent removal of open work is worse than leaving it.

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
The admin session report tags accuracy against the 70-85% sweet spot. After a
week of family play: above 85% raise the at-level/stretch share, below 70%
raise comfort, low comeback rate shorten the review gap. One knob at a time,
one week per change.

*Done when:* two consecutive weekly reports sit inside the sweet spot with at
least one step-up per early session and frustration flags under 10%.

## P2 — Experience decisions that need making


### Character sprites break the no-anti-aliasing rule
`brand/ASSET_MANIFEST.md` states hard pixel edges only, and several shipped
sprites do not meet it: measured soft-alpha was ~34% on `crow_walk`, ~41% on
`cockroach`, ~30% on `crow_idle`. All are correctly authored at 1x; it is the
edges that are soft.

Nothing gates this. The tool that measured it (`audit_pixel_art.py`) was deleted
in the same pass that recorded this entry — it was unwired, printed rather than
failed, and 357 lines to restate a rule already written down. Re-measuring is a
few lines of Pillow against the alpha histogram if the rule is worth enforcing.

*Done when:* the sprites are redrawn with hard edges and a check fails on soft
ones, or `ASSET_MANIFEST.md` admits soft edges for character art on purpose.

### One enemy exists
`enemy_registry.json` contains `cockroach_basic` and nothing else, so every
threat in every world is the same creature. `brand/BRAND_SYSTEM.md` §3.3 already
specifies a roster and §3.1 the ugly law they have to satisfy; `spawn_registry`
plus `setup_from_spawn` means a new enemy is data plus a scene, not a `game.gd`
change.

*Done when:* each world has at least one threat that is not the cockroach, or the
roster in §3.3 is cut down to what is actually intended.

### Four limits of the maths ladder
None of these is decided, and they share one cause: the ladder was derived before
the owl path existed.

- **Two-digit addition and subtraction stay out of the owl's local path
  deliberately.** Whether that holds once a child clears the existing bands is a
  content decision nobody has taken.
- **Subtraction step 5 is structurally sparse** under the current derivation, so
  it ships as a tiny bridge rather than a full band. Either the derivation widens
  it or the band should be merged into its neighbour.
- **Review is queued on failed challenges, not on first wrong attempts** that the
  child then corrects within the same challenge. The second is arguably the more
  useful signal and is currently discarded.
- **Pool ELO ratings are still initialized from legacy static difficulty.** Local
  selection obeys curriculum steps instead, so this does not affect what a child
  is asked — but the telemetry-facing ELO layer is coarse, and any future
  analysis that trusts it will be reading a number nothing maintains.

*Done when:* each is either implemented, or written into PRODUCT.md as a decision
taken on purpose.

### A forgotten PIN locks a child out, and there is no way back
`ProfileManager.login()` really does compare the typed PIN against the stored one
and returns false on a mismatch; `login.gd` renders "Wrong PIN!". There is no
"forgot my PIN" screen, no adult override, and `delete_profile()` exists in
`profile_manager.gd` with no caller anywhere in the UI. So the only route out is
clearing the site's data, which erases every player on the device.

For a 5-to-7-year-old choosing a 4-digit number, forgetting it is the expected
case rather than the edge case, and the cost is another child's progress. Three
plausible shapes, none obviously right: an adult-gated reset on the login screen,
a "this is not a password" affordance that lets any PIN through after N failures,
or wiring `delete_profile()` to a per-player remove that keeps the others. The
first is the most work and the most correct; the second matches what `PRIVACY.md`
tells parents the PIN is for.

`PRIVACY.md` documents the lockout now, so nobody sets a PIN without knowing. It
is still a bad end state.

*Done when:* a child who has forgotten their PIN can get back to their own
progress without destroying anyone else's, or the PIN stops gating entry at all.

### Should an unloseable streak exist at all?
The game keeps an in-level streak: a counter, a HUD flame, an "ON FIRE" state, and
the rule that a wrong answer PAUSES it rather than resetting it. Only leaving the
level clears the count.

**For, as built:** a streak that cannot be lost puts no punishment on the single
most confidence-sensitive moment a child has, and children replaying a level to
protect one are children doing more maths.

**Against:** it is still a thing to protect, while `PRODUCT.md` also says there
should be nothing a child can feel anxious about protecting. Both positions are in
that file, which is honest and unresolved rather than settled.

*Done when:* the mechanic is kept, changed or removed on purpose, and `PRODUCT.md`
states one position instead of two.

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

*Done when:* every entry in `godot/data/tilesets/tileset_manifest.json` reads
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

### `level1_tiles.png` is registered but never selected
It is entry `level1_tiles` in `godot/data/tilesets/tileset_manifest.json`, but no
compiled map reaches it: `level_loader.gd` takes the tileset out of the level's
own `tilesets[0]` and resolves the image by filename, so the manifest entry is
never consulted. It is 32x64, two tiles, and predates the current compiler.

`LevelRegistryEntry.tilesetImages` is a near-miss of the same story and costs
more to remove than it looks. The field is declared in
`math-kernel/utils/Types.ts`, nothing reads its value — and it is in the
`required` list of `godot/data/schemas/level-registry.schema.json`, so all six
registry entries carry it and dropping it means a schema change plus a
re-emit of the registry, not a delete.

*Done when:* the manifest entry is gone, and `tilesetImages` is either removed
from the schema, the type and all six entries together, or something reads it.

### The maths board is themed by colour only, not by material
Every theme file declares `mathBoard.frameSprite`, `mathBoard.bgSprite` and
`mathBoard.optionSprite`, and none has ever had a texture behind it. A world
changes the board's *colour* and nothing else. Emberwood and Geyserworks should
not be the same rounded rectangle in different browns.

`brand/BRAND_SYSTEM.md` §8.3 owns the intent: the board is made of the world's
material — bark, crystal, candy, iron, sky-stone — while its geometry, button
grid and timings stay identical in all five. Skin changes, layout never does.
`brand/ASSET_MANIFEST.md` P4 lists the files.

**The machinery is already in; this is an art task.** `math_challenge.gd` checks
`SpriteSheet.has_art("board_panel")` and builds a `StyleBoxTexture` nine-slice
when a texture exists, falling back to the drawn panel when it does not — which
matters because the board is not a fixed `520x280`: it measures its question,
options and hint and grows, so on a two-line prompt it is close to 380 tall. A
fixed-size PNG would stretch and smear its corners. So each asset is a nine-slice
source plus its border insets, and dropping one in needs no code change.

*Done when:* each world's board is visibly made of that world's material, and the
frame survives a two-line prompt without distortion.

### The HUD has states no screenshot has ever seen
Three designed states have no visual evidence behind them: a lost heart (needs
damage), the streak flame at 3+ (needs two owls answered perfectly in sequence),
and the ability slots (needs an ability granted).

The harness that used to cover this was `tools/theme_screenshots.mjs`, which
drove the Phaser build through `window.__crowGame` and was deleted with it. What
cannot yet drive damage or a multi-owl streak.

*Done when:* the capture tool can reach those three states, or they are checked
some other way and the check is written down.

### Apex hang is blocked by the motion parity contract
The jump would feel more generous with reduced gravity near the top of the arc,
which `brand/BRAND_SYSTEM.md` §2.4 calls for as the `apex` hold. It was left out
of the feel pass deliberately: `godot/tests/test_motion_parity.gd` asserts the
Godot port matches golden fixtures generated from the web motion model
(`tools/golden/gen_motion_fixtures.ts`), and that model has one constant gravity.
Changing it on the web side alone silently breaks parity, so the apex hold has to
land as a matched pair: the motion model and the Godot port in one commit, with
regenerated fixtures.

*Done when:* apex damping exists in the shared model, both runtimes implement it
and the fixtures are regenerated — or the idea is dropped on purpose.

## P3 — Content and localisation

### Visual and richer worded prompts
Addition and subtraction now carry two word-problem shapes each (berries,
birds), gated to steps 3+. Still open: more story families and objects so the
wording doesn't wear out, worded shapes for comparison and sequences, and
visual prompts via the unused `prompt.assets` field (picture-group addition in
the spirit of counting's dot strings). Every new worded shape needs a matching
pattern in `math-kernel/math/wordedArithmetic.ts` — that table is what keeps steps,
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

### Decide: build the export in CI, or keep committing it
`output/web` is the live game — `railway.json` copies it straight into Caddy — and
it is committed by hand. That is ~48 MB of artifact in the tree, re-written on
every rebuild, and `.git` has grown accordingly.

**The fact that should decide this, measured 2026-08-25: the pck is not
byte-reproducible.** Two consecutive `build_web.sh` runs on an unchanged tree
produce pck files of identical size and different content, ~197 KB of 14.3 MB
differing. The embedded Godot caches are byte-stable, so the variation is in the
packing itself. So *every* rebuild churns the artifact whether or not anything
changed — "rebuild to be safe" is never free, and the cost is worse than the
directory size suggests.

**A correction to what was previously recorded here.** An earlier pass concluded
that GDScript comment text reaches the pck bytes, and therefore that normalizing
comments out of the export fingerprint would make the fingerprint lie. That was
inferred from editing a comment, rebuilding, and seeing the pck hash change — an
experiment the nondeterminism above invalidates, because the hash changes on a
no-op rebuild too. **Whether comments reach the bytes is unknown.** Answering it
needs extracting two pcks and diffing the stored files, not comparing hashes. So
the option of a comment-insensitive fingerprint is NOT eliminated; it is
unevaluated.

The three options, then: build in CI and stop committing the artifact; keep
committing it and accept the churn; or narrow the fingerprint so fewer edits
force a rebuild, which needs the deterministic comparison done first.

*Done when:* one of the three is chosen and the reasoning is written into
`deploy/RAILWAY.md`, where the deploy path is described.

### `error_groups` grows without bound, while `error_events` is bounded
Retention is asymmetric, and only one half was designed. `error_events` is
daily-partitioned and dropped whole past `CROW_ERROR_RETAIN_DAYS` (30), which is
the mechanism the runbook and `SECURITY.md` both describe. `error_groups` has no
retention job and no cap on distinct fingerprints, and it is the table that keeps
the `message` plus a `{context, stack}` sample indefinitely.

The fingerprint is a hash of the normalized message, so a caller varying the
message mints a new permanent row. `POST /api/v1/errors` is anonymous and rate
limited to 20/min/IP with up to 10 events a request, so a single address can add
durable rows at roughly a few MB a minute, indefinitely. Nothing prunes them and
nothing alerts on the row count.

This is not the endpoint being insecure — it is body-capped, sanitized, reflects
nothing back, and stores no player-typed text — it is retention that was only
half specified. `SECURITY.md` now names it rather than leaving it to be
discovered.

*Done when:* groups have either a last-seen retention window, a distinct-
fingerprint cap with a documented eviction rule, or a stated decision that
unbounded growth is acceptable at this scale with the arithmetic to back it.

### Dead public API under `godot/scripts/`
The `text_manager.gd` half of this is done: the six functions that made up the
`admin.html` translation editor's API — `set_translation`, `import_translations`,
`export_translations`, `get_override`, `get_default` and `get_all_keys` — are
deleted. They were lines 127-158 of a 158-line file with no caller anywhere in
the tree.

**The read path was deliberately kept, and is still a live question.** `t()`
consults `_overrides` ahead of the locale bundle and the defaults, and
`_load_overrides()` runs at init, so a `crow_translations` value in the store
still outranks every shipped string — with nothing in the game able to write one.
Removing that is a behaviour change for anyone who has such a value, and it would
drop a storage key from the contract in `ARCHITECTURE.md`. Decide it; do not
drift into it.

Still unexamined, and to be checked individually rather than swept — several are
probably reachable in ways a name search cannot see:
`problem_pool_manager.gd` (4 unused query helpers), `save_manager.gd`
(`add_stars`, `increment_owls_saved`, `complete_level`, `grant_ability`,
`set_learner_state`, `load_save`), `level_manager.gd` (`get_next_level`,
`get_next_level_key`), `cloud_sync.gd` (`sign_out`, `pull_save`, `mark_dirty` —
check the panel's signals first), `learner_state_manager.gd`
(`get_confidence_offset`, `get_effective_selection_elo`,
`reconcile_curriculum_floors` — parity-locked, so read the fixtures first),
`game.gd` (`respawn_player`), `brand_button.gd` (`set_role`).

*Watch out:* every one of these lives under the export fingerprint, so a removal
means rebuilding `output/web` in the same commit.

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

### Five of the ten quality gates cannot be measured at all
`brand/BRAND_SYSTEM.md` §14 lists ten gates. B1 is met and asserted by
`test_project_config.gd`; B8 is partly automated by `test_world_palettes.gd`.
B3, B4, B5 and B10 — touch-target size, safe-area clearance, time to first
accepted input, and one-thumb reach — are unmeasurable because nothing in the
suite opens a device viewport and audits the live scene graph. B2 and B9,
sustained 60fps on a throttled profile and reduced-motion behaviour, have never
been measured on any profile.

The device audit that used to do some of this drove the retired Phaser build
through `window.__crowGame` and was deleted with it.

*Done when:* a headless harness can open the four device profiles already listed
in `test_project_config.gd`, walk the real scene graph, and report B3, B4 and B10
per screen. B2 and B9 need a frame trace and a reduced-motion flag; they are
worth splitting out once the viewport harness exists.

### No first-run teaching of any mechanic
A child arriving for the first time is shown a level and left to work out
movement, jumping, shooting and the owl interaction on their own. The maths side
has a teaching window — a worked example on first contact with a new domain — but
the platforming has no equivalent.

*Done when:* a decision exists on whether first-run teaching is in scope at all,
and if it is, which mechanics get it. This is a design question before it is an
implementation one.

### Is the five-level progression the shipping scope, or a vertical slice?
Carried over from the production plan's open decisions, because it changes how
much each world is worth investing in: whether "Only six levels exist" above is
a gap to close or the intended shape of the finished game.

*Done when:* answered. It gates how much art and level content each world gets.

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
  They are vector geometry (`godot/scripts/ui/flag_icon.gd`), not emoji, for the same reason the PIN dots
  and the tick are: a flag emoji is a regional-indicator pair far outside
  Latin-1, Windows ships no flag glyphs so Chrome there renders it as the
  letters "US"/"IS", and the Godot export's bundled font has no emoji at all --
  which is exactly the tofu this whole localisation pass started from.
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
