Status: Supportive
Authority: Working log for this asset-baseline pass, not a source-of-truth architecture doc.
Last verified against code: 2026-08-25

Original prompt: Export tighter runtime assets and wire the game to them so gameplay stops relying on magnification/resizing.

- 2026-03-22: Browser review confirmed the main scale problems were world coins, the padded owl NPC, and the oversized door sheet being resized at runtime.
- 2026-03-22: Generated new gameplay-ready exports from repo-local source art:
  - `public/assets/sprites/characters/npcs/owl-runtime-64.png`
  - `public/assets/sprites/ui/coin/coinsprite-runtime-32.png`
  - `public/assets/sprites/objects/door/door-36-runtime-88x96.png`
- 2026-03-22: Wired BootScene and gameplay code to trust those runtime assets directly instead of forcing `setDisplaySize` / `setScale` in world objects.
- 2026-03-22: Reduced HUD icon size slightly so the new world-scale baseline reads more clearly.
- 2026-03-22: Verification passed with `npm.cmd run validate`, `npx.cmd tsc --noEmit`, and `npm.cmd run build`.
- 2026-03-22: Browser spot-check on desktop shows coins and the owl reading more naturally relative to the crow. Door export was validated by load/build, but not by a dedicated in-level screenshot yet.
- 2026-03-23: Switched the desktop render baseline from `960x544` to `960x540` so `1920x1080` can render at a crisp exact `2x` scale.
- 2026-03-23: Replaced free-fit desktop presentation with a parent-container sizing policy: integer-multiple desktop scaling when the viewport allows it, fit-down fallback for undersized windows, and fit-style behavior retained for touch/mobile contexts.
- 2026-03-23: Frontend QA pass found mojibake in the live English strings file; replaced the broken symbol-prefixed labels with clean ASCII labels so menu and level-select buttons render reliably.
- 2026-03-23: Added a dev-only `window.__crowGame` handle in `main.ts` so Playwright can jump scenes directly during frontend QA without relying on flaky canvas input.
- 2026-03-23: Frontend QA pass found the HUD coin counter was showing a fake `+savedCoins` popup on level load because it booted from `0`; HUDScene now seeds the counter from save data before `COINS_CHANGED` events arrive.
- 2026-03-23: Added enemy-vs-NPC collision in `GameScene` so cockroaches no longer visually phase into the owl NPC at level start.
- 2026-03-23: Frontend QA pass cleaned up the math overlay: it now hides the HUD while active, uses a stronger dim, removes the emoji-style owl prefix from the title, and adds a subtle header backdrop so the NPC intro reads clearly over gameplay.
- 2026-03-23: Main menu `Switch User` control is now a real pill-style button instead of loose top-left text, which reads more like intentional UI on desktop.
- 2026-03-23: Playwright desktop pass confirmed the menu labels are visible after their entrance animation settles, the math overlay now owns the screen cleanly, and the remaining big frontend gap is still missing SFX rather than a rendering/layout regression.
- 2026-03-23: Agent-skills-guided grounding review confirmed the reported float was a visual grounding/read issue, not a collision gap: player/enemy body bottoms and tile tops still matched exactly at runtime.
- 2026-03-23: All compiled levels currently point at `public/assets/tilesets/forest_tiles.png`, so the grounding fix targeted the live floor art rather than adding sprite Y/body-offset hacks.
- 2026-03-23: Applied a minimal grass-lip readability adjustment to `public/assets/tilesets/forest_tiles.png` and mirrored it to `public/assets/tilesets/level1_tiles.png` for fallback consistency. No collision, origin, or camera math changed.
- 2026-03-23: Wrote `docs/GROUNDING_REVIEW_2026-03-23.md` with the Lead Producer report, Frontend Team review, Game Design review, and explicit `What this is` / `What this is not` boundaries.
- 2026-03-23: Follow-up grounding pass corrected the earlier floor-only diagnosis. The remaining issue was the sprite contact silhouette itself, especially the crow feet/claws and the owl's detached bottom smudges.
- 2026-03-23: Edited the actual runtime PNGs instead of adding any per-asset runtime hacks:
  - `public/assets/sprites/characters/crow2/crow3/crow1-64px-fixed.png`
  - `public/assets/sprites/characters/crow2/crow3/crow-walk-64px-fixed.png`
  - `public/assets/sprites/characters/npcs/owl-runtime-64.png`
  - `public/assets/sprites/characters/npcs/cockroach.png`
- 2026-03-23: Sprite pass removed low-alpha junk near the ground and strengthened the contact patch inside the asset itself. Playwright still measured `playerGap = 0` and `enemyGap = 0` afterward.
- 2026-03-23: Updated `docs/GROUNDING_REVIEW_2026-03-23.md` so it no longer overstates the floor-art-only conclusion.
- 2026-03-23: Final grounding fix came from the asset frame itself, not the collider. Live Playwright crops showed the visible art was still sitting too high inside the 64x64 runtime frames even though `sprite.y` and tile-top math matched.
- 2026-03-23: Lowered the runtime art inside the PNG frames and rechecked the same level in Playwright until the grounded read improved:
  - `public/assets/sprites/characters/crow2/crow3/crow1-64px-fixed.png`
  - `public/assets/sprites/characters/crow2/crow3/crow-walk-64px-fixed.png`
  - `public/assets/sprites/characters/npcs/owl-runtime-64.png`
  - `public/assets/sprites/characters/npcs/cockroach.png`
- 2026-03-23: Verified after the asset-only shift that the scene math still remained unchanged (`playerY = 512`, `enemyY = 512`, `npcY = 512` on level 01) while the visual grounding read improved in the live browser.
- 2026-03-23: User review correctly called out that the sprite-only downward shifts were overcorrecting owl/cockroach and cutting into the art. Restored owl and cockroach from cleaner source art before continuing the investigation.
- 2026-03-23: Live Playwright testing supported the user's tile/collision hypothesis direction: the collision plane at the very top of the grass tile was visually too high for the art language of the ground, even when the underlying collision math was correct.
- 2026-03-23: Landed a shared world-actor grounding policy instead of more per-asset edits. `src/utils/applyGroundingVisualSink.ts` now applies a single `4px` visual sink to player, cockroach, and NPC sprites while counter-shifting the Arcade body offset so gameplay/collision behavior stays the same.
- 2026-03-23: Wired the shared grounding inset into:
  - `src/entities/Player.ts`
  - `src/entities/enemies/Cockroach.ts`
  - `src/entities/npc/BaseNPC.ts`
- 2026-03-23: Validation passed after the shared grounding change with `npx.cmd tsc --noEmit`, `npm.cmd run validate`, and `npm.cmd run build`. Live Playwright check at `1920x1080` showed noticeably better grounded reads for crow, cockroach, and owl without further sprite mutilation.
- 2026-03-24: Reworked local math progression so owl selection is now curriculum-step capped instead of directly authorizing harder questions from raw ELO alone.
- 2026-03-24: Added per-problem `curriculumStep` and `difficultyTraits` metadata across all live math pools, plus validator enforcement to keep that metadata aligned with the authored prompt content.
- 2026-03-24: Added per-domain curriculum progress to learner state: `currentStep`, `winsAtCurrentStep`, and recent step results now drive promotion after 5 strong wins and demotion after rough stretches.
- 2026-03-24: Removed local stretch selection for owl math, changed the within-domain mix to easier/review/current-step only, and replaced broad fallback with step-down-only behavior.
- 2026-03-24: Kept mixed-domain play but changed domain choice from "least-practiced domain wins" to a `70/30` configured-domain bias so subtraction can appear as a lucky easy prompt without hijacking the whole session.
- 2026-03-24: Added a local owl safety rail of `maxOperand <= 20`, which keeps two-digit addition and subtraction out of the live local owl loop until a denser later ladder exists.
- 2026-03-24: Runtime-faithful local simulation confirmed the first 15 fresh-profile owl prompts stayed in addition steps `0-2`, and the first mixed addition/subtraction prompts after subtraction unlock stayed in tiny single-digit addition and subtraction with no operands above `5`.

- 2026-03-24: Authored Bridge Pack A directly into `public/data/math/problems_curriculum.json` so the local child ladder gets denser without loosening the selector safety rails.
- 2026-03-24: Addition steps `10-19` now each have 6 unique prompts in the live local owl path, including the previously empty addition steps `11` and `12`.
- 2026-03-24: Subtraction steps `6-13` now each have 6 unique prompts in the live local owl path, and targeted duplicate prompt texts in those bands were replaced with unique bridge prompts.
- 2026-03-24: Added a tiny subtraction step `5` bridge (`10 - 0`, `10 - 10`) so local step progression does not dead-end there, while documenting that this step remains structurally sparse under the current derivation.
- 2026-03-24: Added an offline math authoring layer under `authoring/math/**` with a seed curriculum copy, canonical band table, 18 deterministic batch specs, and JSON schemas for both source files.
- 2026-03-24: Implemented `tools/math_authoring.ts`, `tools/materialize_math_batches.ts`, and `tools/review_math_batches.ts` so Crow can materialize concrete curriculum output from offline templates without changing the runtime pool contract.
- 2026-03-24: Materialized the first full trusted expansion from `300` total runtime problems to `3000`, with `2885` now living in the curriculum pool and the final full-repo domain totals landing at:
  - addition `1000`
  - subtraction `850`
  - multiplication `400`
  - division `250`
  - counting `125`
  - comparison `125`
  - pattern matching `125`
  - number sequence `125`
- 2026-03-24: Added batch review reports under `reports/math-batches/**` and moved the review gate to a lead-producer-style triple review: template review, concrete batch review, and runtime simulation review.
- 2026-03-24: Late-wave batch review originally stalled because the simulation proxy walked sparse integer steps as if every step existed. Updated the proxy to follow populated batch step bands instead.
- 2026-03-24: Review summary now shows `18/18` accepted batches with an average accepted grade of `9.86`.
- 2026-03-24: `npm.cmd run validate` now checks authoring schemas, band alignment, and drift between offline batch specs and the live materialized curriculum pool.
- 2026-03-24: Tightened the trust surface after external review: the materializer now protects exact prompt text already present in the seed plus the legacy runtime pools, instead of only deduping generated rows against each other.
- 2026-03-24: Added independent arithmetic truth checks in `tools/math_verifier.ts`; validation and concrete batch review now recompute arithmetic answers from the prompt text and fail on answer drift.
- 2026-03-24: Fixed division `difficultyTraits.maxOperand` so the live local owl cap reflects the biggest visible number in the division problem instead of underreporting most division prompts.
- 2026-03-24: Added `reports/math-batches/runtime-selector-smoke.json`, which exercises the live local owl selector and learner-state path directly; current smoke result is green with 0 operand-cap breaches, 0 selector-cap breaches, 0 early subtraction unlocks, and 0 exhaustion events.
- 2026-03-24: Cleaned exact prompt collisions still living in the seed and legacy runtime pools so `npm.cmd run validate` now passes duplicate-prompt checks across the full shipped runtime surface, not just the generated curriculum wave.
- 2026-03-24: Sealed the shipped owl fallback path so both primary and fallback selection now stay inside the same difficulty, operand, and curriculum-step rails.
- 2026-03-24: The owl is now addition-first but no longer arithmetic-only overall; the fresh opening state mixes in counting, pattern matching joins later through the normal unlock rules, and encounters serve `2` problems for more built-in repetition.
- 2026-03-24: Fixed the last internal selector escape hatch in `MathProblemManager` so recent-window resets and uninitialized-ELO fallback both preserve owl-safe caps instead of silently widening selection.
- 2026-03-24: Follow-up owl questions now prefer an alternate unlocked domain before falling back to the full owl-safe set, which makes two-problem encounters meaningfully more varied without loosening the child-safe rails.
- 2026-03-24: The runtime smoke report now mirrors the shared owl-selection helper used by the live component, and the latest generated scorecard is green at `9.9/10` with fallback safety explicitly passing.
- 2026-03-24: Added `tools/math_browser_smoke.mjs` plus `npm.cmd run math:browser-smoke`, a literal browser-backed smoke that drives the live owl interaction through wrong-answer retry, follow-up problem, and overlay close without changing runtime behavior.
- 2026-03-24: Tightened the dev-only math smoke hook in `src/main.ts` so it keeps completion history for two-problem encounters and only reports math state while `MathChallengeScene` is actually active.
- 2026-03-24: Green browser smoke now writes `reports/math-batches/runtime-browser-smoke.json` and refreshes screenshots in `output/playwright/math-browser-smoke/`, giving the math authoring pipeline an explicit "what it is / what it is not" browser-proof artifact alongside the selector-only smoke.
- 2026-08-23: Diagnosed the four white boxes on the Godot PIN screen as missing-glyph tofu for `U+25CF`. Both ports drew the PIN dots as the text characters `●`/`○`, which live in the Unicode "Geometric Shapes" block that Godot's built-in font does not carry and the browser's unpinned `monospace` fallback carries only on some devices. Replaced them with drawn geometry, and did the same for two more instances of the pattern found by the new guard: the locked-level padlock (the emoji `U+1F512`) and the dialog-box advance arrow (`U+25BC`).
- 2026-08-23: Inventoried every character the string bundles need. Icelandic requires 16 letters, all in Latin-1 Supplement, which has universal font coverage -- so no webfont is needed. The tofu exposure was entirely decorative glyphs used as UI primitives, not the language.
- 2026-08-23: The web build had no locale concept at all and had never loaded `strings_is.json`, while the Godot port already had a tested locale-aware TextManager with no UI to call it. Brought the web `TextManager` up to the same contract (override -> active locale -> English -> key, `crow_locale` persistence, browser-language detection, `LOCALE_CHANGED` on the EventBus) and added the EN/IS language selector to both ports.
- 2026-08-23: The selector is a segmented control on Login and Main Menu, labelled with endonyms (`English` / `Íslenska`) that are never translated, with the selected state carried by a filled pill *and* a drawn tick rather than colour alone. Deliberately not in the pause menu: switching mid-level would need live re-rendering of the HUD, touch controls and any open overlay.
- 2026-08-23: Made translation overrides per-locale (`crow_translations_v2`, migrating the old flat map into the English bucket) and gave `admin.html` a locale picker. The old single bucket was locale-blind, so an Icelandic edit would have overridden English the moment a second locale became selectable.
- 2026-08-23: Icelandic review, 52 of 62 strings passing unchanged. Ten corrections, headed by a real grammar error: `game.completion_stats` read "Uglur bjargaðar", but `bjarga` governs the dative and cannot take a nominative passive subject, so it is "Uglum bjargað" -- which the bundle already had right in `game.owl_saved`. Also `pause.title` "Í BIÐ" (queue/on-hold register) to "HLÉ", the missing dative object in `math.greeting_3`, and a `menu.continue`/`pause.resume` label collision.
- 2026-08-23: Routed nine hard-coded English strings through `t()` (touch labels, `Level Complete!`, `LEVEL UP!`, `Oops!`, the problem counter) and translated the six level names. Replaced the length-driven font-size hack in `TouchControls` (`label.length > 2 ? '18px' : '32px'`) with a role-based size plus shrink-to-fit.
- 2026-08-23: Added `tools/validate_i18n.mjs` to `npm run validate`: a Latin-1 glyph allowlist (which decodes `\uXXXX` escapes, since the original bug was written as `'\u25CF'` and pure-ASCII on disk), web/Godot bundle parity, lockstep and placeholder parity, and a fit budget measuring every constrained string against its box. Added `tools/i18n_screenshots.mjs` for the visual half of that evidence.
- 2026-08-23: Two pre-existing layout bugs surfaced by those screenshots and fixed: the login PIN screen's Back button was drawn at y=564 on a 540-tall canvas, so a child who picked the wrong profile had no way back; and level-select labels started at x-40, leaving a 112px hole after the index while running the name into the padlock on locked rows.
- 2026-08-23: Still open -- level select lays out 6 registry levels at 112px spacing from y=140, so levels 5 and 6 fall off the 540-tall canvas and are unreachable from that screen. The login profile list overflows the same way at 4+ profiles. Both need a layout decision (scroll, pagination, or smaller nodes) rather than a nudge.
- 2026-08-23: Renamed the protagonist to Hörmann. Display text (`menu.title`, `login.title` in all four bundles), page titles, asset-credit prose and current-state docs all now name him. Deliberately left alone: the `crow_*` localStorage keys (`crow_profiles`, `crow_save_<user>`, `crow_locale`, `crow_active_user`, `crow_family_id`), the `crow` texture keys, sprite paths, the `crow-platformer` package slug and the dated review docs under `docs/`. Renaming the storage keys would silently orphan every existing profile and save. Note the committed Godot web export under `output/web/` still carries the old name inside `index.pck`; that needs a Godot re-export.
- 2026-08-23: Fixed a pre-existing flake in `tools/math_browser_smoke.mjs` that was blocking the fingerprint refresh. The math board locks input for a few seconds after a wrong answer while the retry feedback plays, and the harness clicked the correct answer once, 700ms later -- inside the lockout -- then waited 8s for a second problem that could never arrive. Because problem selection is non-deterministic and the lockout length varies by problem type, the smoke passed or failed by draw. It now retries the correct answer until the completion registers; the assertion that a distinct second problem must follow is unchanged. Three consecutive green runs on different draws.
- 2026-08-23: `npm run validate` is green end to end for the first time. `tools/gen_sfx.py` now writes the same 15 WAVs to both `godot/assets/audio/sfx/` and `public/assets/audio/sfx/` and both are committed -- the web build had been shipping with no SFX at all because the generator only ever targeted the Godot side, while `audio_manifest.json` declared them required and `validate_assets.js` failed on all 15. Added the missing Status/Authority/Last-verified metadata to `godot/README.md`, `godot/ARCHITECTURE.md` and `output/web/README.md`, and corrected the stale ONBOARDING audio snapshot from "no live SFX entries" to 15.
- 2026-08-23: `godot/project.godot` `config/name` is now Hörmann, so the next Godot export bakes the right name in. The already-committed `output/web/index.pck` still carries the old one; on web the visible tab title comes from the export's `index.html` (already renamed), so the stale value is internal only.
- 2026-08-23: Level select and the login profile list now scroll, via a new shared `src/ui/components/ScrollList.ts`. Level select previously laid 6 registry levels out at a 112px pitch from y=140, putting the sixth at y=700 on a 540-tall canvas: Mosabrú and Trjátoppaslóð existed and could not be reached at all. The login list did the same once a family had four children, pushing "+ New User" off the bottom so a fifth could never be added.
- 2026-08-23: Design notes for the scroll, aimed at 5-7 year olds. The row pitch is chosen so the next row always peeks above the fold -- for a child who cannot read a scrollbar, a partially visible item is the affordance; the bottom fade, the drawn bobbing arrow and the thumb are all secondary to it. Rows activate on pointer *up* and bail when `wasDrag()` is true, so a scroll attempt can never launch a level or open someone else's profile. Level select auto-scrolls to the player's current level on entry. Everything drawn is geometry, so the scroll arrow cannot become the missing-glyph box the PIN dots were.
- 2026-08-23: Three bugs found by actually running it rather than reading it. Momentum never clamped, so a flick sailed ~130px past the last row and crawled back over three seconds -- it now stops dead at either end. Friction was per-frame rather than per-unit-time, so the glide length varied with frame rate; it is now normalised against a 60fps step. And `ScrollList.destroy()` did not destroy its content container: the orphaned children kept their interactive zones, so a stale login profile list left the "+ New User" hit area live at y=274 underneath the Create Character screen, and tapping GO at y=280 silently re-entered the new-user state and wiped the name just typed. Only reproduced from the second profile onward, because with zero profiles that button sits at y=194 and does not overlap GO.
- 2026-08-23: `UINavigator` gained `setItemPosition`/`getFocusIndex` so the focus ring tracks rows inside a scrolling list, and keyboard focus scrolls itself into view via `ScrollList.revealRange`. Verified end to end in a browser: flick rests exactly at maxScroll, a drag on a row does not activate it, `revealRange` scrolls the minimum distance, five profiles create cleanly with the list scrolling from the fourth onward, and the full login flow still completes in both locales.
- 2026-08-23: Not done, deliberately: the Godot port's level select and profile list still use a plain CenterContainer/VBoxContainer. Godot's level select fits its current 6 levels at roughly 526px of 540, so it is tight rather than broken, and there is no Godot binary in this environment to verify container semantics against -- the headless test suite asserts logic, not layout. Shipping an unverifiable layout change there would be worse than leaving it tight.
- 2026-08-23: The Godot port's level select and profile list now scroll too. Previously skipped because there was no Godot binary here to verify container semantics against; Godot 4.3 headless turns out to install and run fine in this container, which also means the GDScript suite ran here for the first time -- 58 passing before this change, 61 after. Level select and login each wrap their growing list in a `ScrollContainer`, with the title and Back button moved outside the scroller so they can never scroll out of reach, and every fixed-width child switched to `SIZE_SHRINK_CENTER` now that the VBox fills its width.
- 2026-08-23: Added `godot/tests/test_scrolling_lists.gd`, which mounts the real LevelSelect and Login scenes headless and asserts each puts its growing list in a ScrollContainer that fits inside the 540px viewport and does not scroll sideways. Verified the assertions actually bite by pushing the viewport off-screen and by enabling horizontal scroll -- both fail, and restoring gives 61/61 again.
- 2026-08-23: Added `roadmap.md` for open work only, with hard rules at the top: finished items get deleted rather than ticked off, and what was done is recorded here in `progress.md` instead. `tools/validate_docs.js` now enforces that -- it fails the build on ticked checkboxes, strikethrough, check-mark characters, "(done)" annotations or a completed-work heading inside the entries, and on removal of the rules block itself. The rules block and the Settled section are scoped out of the word checks so the file can quote the markers it forbids; the marker checks still cover everything below the rules, so a finished item cannot hide by being appended at the bottom. README and AGENT_CONTEXT point at it.
- 2026-08-24: ELO/difficulty review pass found why difficulty "wasn't registering" in play: the curriculum ladder (not ELO) drives selection, and its tuning ratcheted learners downward. Demotion re-fired on every attempt while 2 wrongs sat in the last-5 window (up to 4 demotions from 2 misses), a single wrong answer from neutral confidence hit the old `-15` demotion threshold exactly, and promotion needed 5 first-try wins at-level while at-level problems were only served 25% of the time.
- 2026-08-24: Retuned the ladder in `LearnerStateManager`: demotion now only evaluates on the wrong answer itself, the confidence demotion threshold moved to `-25` with post-demotion softening to `-10`, promotion needs 3 first-try at-level wins at `80%` window accuracy, and promotion skips authored step holes via a pool-backed step-content provider (wired in `ELOUpdateManager.init`). Starting steps reconcile against the pools so domains whose content starts above step 0 (number_sequence) are reachable.
- 2026-08-24: Fixed an unconditional step-jump bug: an above-step problem used to promote the learner even when answered wrong; it now requires a first-try correct answer.
- 2026-08-24: Enabled the previously dead stretch lane in `ELOAwareStrategy` (weights now 40/20/30/10 comfort/review/at-level/stretch), gated by the existing `canUseStretchLane` hot-streak check; empty lanes renormalize.
- 2026-08-24: Retuned `ELOManager` mastery so it visibly tracks reality: K-factor `16/12/8` (was `4/3/2`, under which the delta caps could never bind), caps now `+8/-8`. ELO remains a mastery signal; the step ladder stays the selection authority.
- 2026-08-24: Widened the owl `difficultyRange` from `[1, 2]` to `[1, 3]` in `npc_registry.json`. Under the old band comparison hard-stalled at step 3 and addition at 17 even though authored content exists; the curriculum step cap and `maxOperand: 20` remain the safety rails.
- 2026-08-24: `MathBoard` now shuffles MCQ options at render time. The authored data places the correct answer in the last slot 62% of the time (and 3rd slot 31%), which kids can exploit and which polluted every adaptive signal.
- 2026-08-24: Updated the runtime selector smoke rail in `tools/math_authoring.ts` to the new contract (selection may reach `currentStep + 1` via the gated stretch lane) and refreshed `MATH_SYSTEM_ARCHITECTURE.md` plus the `validate_docs` pins. Regenerated math reports; runtime selector smoke re-accepted at grade 10 with 0 cap breaches, and the depth probe now reaches curriculum step 19 (was 7). Browser smoke re-accepted against the live dev server.
- 2026-08-24: Verified with `npx tsc --noEmit`, `npm run validate` (all green), and a session simulation driving the real selection + learner-state modules: a perfect player climbs addition step 2->7 in 40 attempts, a 90% player reaches step 6 absorbing one demotion, and a 60% player settles safely at the floor without cascade demotions.
- 2026-08-24: English question-content audit: 3000 problems, no duplicate prompts, no wrong answer keys in verifiable arithmetic, hints/explanations present everywhere; wording is all symbolic arithmetic with cosmetic framing variants, so real variety (word problems, visual contexts) is still open work, as is authoring content for the subtraction step 15-20 hole.
- 2026-08-24: Math-teaching experience pass (follow-up to the ELO review). Difficulty step-ups are now celebrated: `ELOUpdateManager` emits `CURRICULUM_STEP_UP` when a domain promotes, and the HUD queues the banner until it is next visible so the math overlay's own flow is never delayed; demotions are deliberately never signaled. Added `math.step_up` plus 8 `domain.*` i18n keys to all four bundles.
- 2026-08-24: A second miss now teaches instead of shrugging: `MathBoard.revealAnswer` highlights the correct option, dims the rest, and shows the authored explanation; `MathChallengeScene` holds the overlay 3s so it can be read. `responseMs` is now honest time-to-first-answer captured at the tap (it was previously measured at the COMPLETE emit, inflated by the 1.5s celebration delay).
- 2026-08-24: Question authoring upgrades in `tools/math_authoring.ts`: MCQ options are shuffled deterministically at generation (the ascending sort put the correct answer in a predictable slot); addition/subtraction gained word-problem variants ("You have 3 berries. You find 2 more.") gated to steps 3+ via the new shared parse table `src/math/wordedArithmetic.ts` (steps, traits, replay keys, and the verifier all re-derive facts from it); steps 0-2 keep only the bare equation and simplest question form so reading load never gates the math. `MathBoard` scales long prompts down with word-wrap — framed prompts over ~15 chars were already overflowing the board.
- 2026-08-24: New `batch_19_subtraction_teens_upper` fills the operand 17-20 subtraction hole (150 problems, steps 9-16, includes 20-minus-single-digit borrow and teens-minus-teens). Subtraction steps 17-20 turned out to be structurally impossible under the step derivation (operands <= 20 cannot reach them), so the ladder's hole-skipping — now requiring at least 3 problems per rung — carries learners across. Total runtime inventory: 3150 problems (curriculum 3035).
- 2026-08-24: Recalibrated `sequence_variance` and `pattern_variance` bands to cap at ELO 600 (difficulty 3.0) so all kid-facing counting/comparison/sequence/pattern content is servable under the owl's [1,3] difficulty band; correct-answer positions across the pool are now near-uniform ({0:882, 1:765, 2:823, 3:680}).
- 2026-08-24: admin.html learner cards now show the curriculum step and wins per domain plus a last-session report (gap-split at 30 minutes): problem count, first-try accuracy tagged against the 70-85% sweet spot, average time to answer, and lane mix — the real-play evidence loop for future tuning.
- 2026-08-24: Documented the remaining math opportunities in roadmap.md: Godot port parity (stale data copy, old ladder, pinned golden fixtures, render-order options), misconception-tag consumption, fluency signal from responseMs, ELO-informed within-lane selection and problem-ELO calibration, review backlog decay, difficulty/step scale unification, and the multiplication/division fate decision.
- 2026-08-24: Re-exported `output/web/` and corrected a claim I had made twice. `railway.json` builds `deploy/web/Dockerfile`, which does `COPY output/web /srv` -- so the live deployment is the committed **Godot** HTML5 export, not the Phaser build. `index.pck` had never been re-exported, so the live game was a binary predating all of this work: no language selector, no Icelandic, the old `E` interact label, the old PIN dots. I had described the stale pack as "cosmetic, internal -- players never see it". The opposite is true: players see only the pack.
- 2026-08-24: Godot export templates (4.3.stable) install in this container alongside the headless binary, so `bash godot/tools/build_web.sh` runs here. Re-exported and verified by actually loading `output/web/` in a browser over WebGL: title reads Hörmann, the language selector renders on the login screen, tapping Íslenska switches the UI to "Hver er að spila?" / "+ Nýr leikmaður", zero page errors. The new pack carries `HÖRMANN`, `Skógarlundur`, `Uglum bjargað`, `HLÉ`, `Prófessor Úhú`, and no longer carries `Uglur bjargaðar`, `Prófessor Húh` or `Í BIÐ`.
- 2026-08-24: Fixed the Godot language pill's tick colliding with its label -- Godot centres Button text and the Line2D tick sat 14px in, so "Íslenska" rendered as "<tick>slenska". Narrowed the tick and moved it hard against the pill edge. Also renamed the export preset's `apple-mobile-web-app-title` from Crow to Hörmann, which is the iOS home-screen name.
- 2026-08-24: Added `.github/workflows/web.yml`, the first CI the web build has ever had. `ci.yml` was path-filtered to `godot/**`, so a pull request touching only `src/**` ran nothing. Two jobs: `checks` (npm ci, `tsc --noEmit`, `npm run validate`) which also validates the committed browser-smoke fingerprint and therefore catches "changed fingerprinted source without re-running the smoke"; and `smoke`, which resolves a runner browser, starts the dev server, asserts the 15 SFX are present, and runs the browser smoke fresh, uploading the report and screenshots either way.
- 2026-08-24: Drove the exported build end to end in Playwright rather than asking for it to be spot-checked: language switch, profile creation, relaunch persistence, main menu, level select, into a level, and an owl encounter. Confirmed live in Icelandic -- Líf/Mynt/Uglur, STÖKK/SKOT/GOGGA (the literal "E" is gone), VELDU BORÐ with all six translated level names and "(Læst)", drawn PIN circles instead of tofu, "Prófessor Úhú", "Smá stærðfræðistund!", and "> SPILA ÁFRAM" distinct from pause.resume. Locale and profile both survive a browser relaunch (Godot persists to IndexedDB).
- 2026-08-24: Two real bugs found by playing it. `godot/scripts/ui/math_challenge.gd` hardcoded "\nProblem %d of %d" -- the web build was fixed earlier but the Godot port was not, and the hardcode guard missed it because it is a format string assigned to a var rather than `.text = "literal"`. Now goes through `math.progress` and renders "Verkefni 1 af 2".
- 2026-08-24: The on-screen touch controls did nothing for mouse users. Godot does not route mouse input to TouchScreenButton by default, and `touch_controls.gd` shows them whenever `OS.has_feature("web")` is true -- so every desktop-browser player saw a d-pad, STÖKK, SKOT and GOGGA that looked tappable and were inert, with no hint that the keyboard was the only way to play. Enabled `pointing/emulate_touch_from_mouse`. First attempt did not work because I wrote the key as `input_devices/pointing/...` inside the `[input_devices]` section: in project.godot the section name *is* the first path segment, so the real setting became `input_devices/input_devices/...`. Caught it by reading the value back through a headless script instead of assuming, then verified by walking the crow and opening an encounter with the mouse alone.
- 2026-08-24: Measured the remaining localisation gap. 2331 of 3000 problem prompts contain English words, but only 206 distinct phrasings exist and the top 20 cover 87% -- so it is a templated phrase list, not 2331 strings. Added to the roadmap as P1 with the schema options, since prompts are covered by the content validators, the arithmetic verifier, duplicate-prompt checks and the Godot parity fixtures, and picking a per-locale representation is a real decision rather than a quick edit.
- 2026-08-24: Added `tools/godot_play_smoke.mjs` (`npm run godot:play-smoke`), which plays the exported build: boots it, switches locale, creates a profile, walks the menus, starts a level, moves the player and reaches an owl encounter, asserting at each step and writing screenshots. Nothing was checking `output/web`, which is what Railway serves.
- 2026-08-24: The first version of that smoke was worthless and passing. It compared PNG *bytes*, and compression means one changed pixel rewrites the whole stream, so every comparison came back saturated and every assertion passed regardless of what the game did -- it cheerfully reported the touch controls working while they were doing nothing. Now decodes to raw pixels with sharp and compares per-channel with a tolerance. Second flaw: a level is never a still image, so any before/after diff passes on spinning coins alone. It now measures an ambient noise floor over the same span with no input and requires the input-driven change to clear it several times over. Verified both assertions fail when they should -- pressing an unbound key, and never walking -- and pass otherwise, with wide margins (walk 0.998 against a 0.035 threshold; scene brightness 160 to 61 on the encounter overlay).
- 2026-08-24: Retracted a wrong conclusion. I reported the on-screen d-pad dead for mouse users and "fixed" it with `pointing/emulate_touch_from_mouse`. Re-testing with a working metric showed it dead for *touch* too, including a held CDP touch -- which contradicted the user playing the old build and collecting coins. `godot/tests/test_touch_controls.gd` settles it at the source: a real `InputEventScreenTouch` at the button centre does press the bound action, and releasing releases it. So the controls are sound and the browser failure is synthetic-input artefact: neither Playwright mouse nor CDP touch reaches Godot's TouchScreenButtons in headless Chromium. The play smoke now drives gameplay by keyboard, which does work in a browser, and the touch path is covered by the Godot test where it can be trusted.
- 2026-08-24: Kept `emulate_touch_from_mouse` -- it is the documented mechanism and the exported build's Control buttons still respond to the mouse with it on -- but rewrote its comment to stop claiming a fix I never demonstrated, and added a roadmap item asking someone to click the d-pad with a real mouse. The fallback, if it does not work, is to hide the controls unless `DisplayServer.is_touchscreen_available()` rather than show dead buttons.
- 2026-08-24: Also fixed while playing: `godot/scripts/ui/math_challenge.gd` hardcoded "\nProblem %d of %d", so the encounter header read English inside an otherwise Icelandic game. The hardcode guard missed it because it is a format string assigned to a var rather than `.text = "literal"`. Now renders "Verkefni 1 af 2".
- 2026-08-24: Godot math-ladder parity pass, prompted by main's finding that the deployed game is the committed Godot export — meaning every ladder fix so far had only reached the web build. Ported to GDScript: ELO K-factor `16/12/8` with `+8/-8` caps (`elo_manager.gd`); wrong-answer-only demotion at threshold `-25` with post-demotion softening, promotion at 3 wins / 80% with step-hole skipping via a pool-backed content provider and curriculum-floor reconcile (`learner_state_manager.gd`); the 40/20/30/10 lane split with the gated stretch lane (`elo_aware_strategy.gd`); provider wiring and a `curriculum_step_up` signal (`elo_update_manager.gd`, `event_bus.gd`).
- 2026-08-24: Godot UX parity in `math_challenge.gd`: MCQ options render in a shuffled display order (submit_answer keeps its index-into-options contract, so tests and callers are untouched); the authored hint shows on the first miss and the second miss reveals the correct answer with the explanation for a 3s teach beat; long prompts scale down and word-wrap; `responseMs` is time-to-first-answer. `hud.gd` celebrates `curriculum_step_up` with the existing burst/fly-up FX — demotions are never signaled. New `math_challenge` tuning keys in `godot/data/tuning/ui_tuning.json`.
- 2026-08-24: Synced `godot/data/math/problems_curriculum.json` to the regenerated web pool and added a byte-identity guard to `tools/validate-content.ts` so the copies can never silently drift again. Regenerated the golden parity fixtures from the new TS behavior; `test_math_parity.gd` now neutralizes the runtime step-content provider (the fixtures exercise the pure state machine) and the full Godot suite passes 64 unit tests plus all integration probes.
- 2026-08-24: Re-exported `output/web/` with Godot 4.3 so the deployment serves the new ladder, shuffled options, teach-on-miss, and step-up celebration. `npm run godot:play-smoke` against the fresh export: clean — language switch, profile creation, level start, movement over the noise floor, owl encounter overlay, zero console errors. The encounter screenshot shows shuffled options live. Deleted the roadmap's Godot-parity item; all four gaps it named are closed.
- 2026-08-24: The baseline owl now asks exactly one problem per encounter — answer it and the owl is saved. `problemCount` stays per-NPC config in `npc_registry.json` (both ports' components already loop to the configured count, so a future gated "padlock owl" variant can demand 2-3 answers with a registry entry alone; added that variant to the roadmap). Set both registries to `problemCount: 1`, fixed the Godot registry's stale `difficultyRange` (`[1,2]` -> `[1,3]` — a drift the math-pool sync guard didn't cover), and extended the validate-content sync guard to `npc_registry.json` so NPC config can never diverge between ports again.
- 2026-08-24: Updated everything that assumed two problems: the browser smoke now proves the single-problem flow (wrong answer -> retry -> correct -> overlay closes with exactly one completion; gate `singleProblemEncounter`); the authoring review harness no longer grades interaction length (one problem is the deliberate baseline, not a defect); the owl probe reports the actual solve count; docs and the ONBOARDING pin (now singular-aware, derived from the live registry) say one problem. Multi-problem UI (progress header, alternate-domain follow-ups) stays dormant but tested for future NPCs.
- 2026-08-24: Verified end to end: tsc clean, `npm run validate` green, materialize 19/19 with selector smoke at grade 10 and `interactionProblemCount: 1`, browser smoke accepted, Godot suite 64+probes green (`owl_probe: 1 problem(s) solved, owl_saved`), `output/web` re-exported and the play smoke runs clean against it.
- 2026-08-24: Beating-heart Phase 1 — every level now teaches, then tests. Wired the previously dormant `mathGating` from the level specs into runtime: it is mirrored into `level_registry.json` (both ports), and the owl component intersects the level's skills and difficulty band with its own NPC config, so level 1 is the addition-and-counting forest and level 2 introduces subtraction. The curriculum ladder still owns how hard; the level owns which math; an empty intersection falls back to the NPC config.
- 2026-08-24: The teaching window: when a level's gating includes a domain with `totalAttempts` 0 (new persistent per-domain counter in `curriculumProgress`), the owl opens with a worked-example demo — problem shown, localised hint as "thinking aloud", answer revealed with its explanation, "Your turn!" — accepting no input and emitting no learner-model events. It hands over to a freebie problem in the same domain: a win records normally, a miss records nothing. Both ports (`MathChallengeComponent`/`MathChallengeScene`/`MathBoard` and the GDScript mirrors), new `MATH_DEMO_COMPLETE` event, `math.demo_watch`/`math.demo_your_turn` keys in all four bundles.
- 2026-08-24: The comeback arc: a correct answer on a review item whose last outcome was wrong fires `MATH_COMEBACK`, and both HUDs celebrate "You learned it!" (`math.comeback`) harder than an ordinary win — a miss becomes the setup for the best available moment. The HUD banner queue is generalised for all good-news celebrations; demotions still never signal.
- 2026-08-24: Progress pips: the math overlay shows one pip per first-try at-level win banked toward the next promotion (target from `getPromotionWinTarget`), drawn in code in both ports (web Graphics circles; Godot Panels with StyleBoxFlat — no glyph primitives, per the i18n house rules).
- 2026-08-24: Harnesses updated for the new opening: the browser smoke waits out the demo and gates on `teachingDemoSeen`; the owl probe's frame budget covers the 5.2s demo and passes through demo → freebie → owl_saved. Verified: tsc clean, `npm run validate` green, Godot suite 72 passed + all probes, browser smoke accepted with all gates, `output/web` re-exported and the play smoke clean against it.
- 2026-08-24: Mapped the remaining beating-heart plan into roadmap.md as a P1.5 section: golden problems, session-end recap, trophy shelf, one shared math-tuning file, tune-against-real-play, and a design pass over the per-level math mixes.
- 2026-08-24: Beating-heart Phase 2a — one shared math-tuning file. Every tunable math-experience number (ladder promotion/demotion, stretch gate, lane weights, teaching-window pacing, golden economy) now lives in `data/tuning/math_tuning.json`, byte-identical between `public/data` and `godot/data` (new validate-content guard fails on drift or absence). The web port loads it in BootScene before any learner code runs (`src/math/MathTuning.ts` — deliberately no compiled defaults, so a missed initialize crashes loudly instead of drifting); Node harnesses (fixtures generator, selector smoke) read the file explicitly; the Godot port reads it through DataManager in `learner_state_manager.gd`, `elo_aware_strategy.gd`, and `math_challenge.gd`. validate_docs now derives the lane-weight doc pins from the JSON, so a tuning edit forces the architecture doc to follow.
- 2026-08-24: Beating-heart Phase 2b — golden problems. Roughly 1 in 8 real owl problems arrives golden: pulsing gold frame (web Graphics stroke; Godot PanelContainer + StyleBoxFlat with a self_modulate tween), a new synthesized shimmer chime (`golden.wav` via tools/gen_sfx.py, wired into both audio manifests and sound_events), and a bonus coin multiplier on the win (2x first-try, 1.5x retry, both from tuning). The roll is a seeded coin flip on (childId, lifetime attempt index) — `src/math/goldenRoll.ts` and `golden_roll.gd` share an FNV-1a + avalanche hash, held identical by 120 new goldenRolls fixtures in `test_math_parity.gd`. Never during the teaching window; never tied to time or streaks; a golden miss costs nothing extra. Attempts now carry a `golden` flag through both ports' learner records, and the admin session report counts golden problems served.
- 2026-08-24: Phase 2 verified: tsc clean, `npm run validate` green, Godot suite 73 passed (new golden-roll parity test) + all integration probes, browser smoke accepted, `output/web` re-exported with the play smoke clean against it. Deleted the roadmap's golden-problems and shared-tuning-file items.
- 2026-08-24: Beating-heart Phase 3a — session-end recap (peak-end rule). New SessionStats (web singleton + Godot autoload) counts the good things during play: owls saved, problems solved, step-ups, comebacks, golden wins. Arriving back at the main menu with something to celebrate shows one warm recap over the menu — counts first, the session's single best moment last (comeback beats golden beats step-up), an "Onward!" button out — and consuming resets the counters so it shows exactly once. Nothing negative can render: only positive counts exist, zero-lines are skipped, and an empty session shows no recap at all. New `recap.*` keys in all four bundles.
- 2026-08-24: Beating-heart Phase 3b — trophy shelf. `curriculumProgress` gained a `highestStep` high-water mark (raised on every step rise, seeded from `currentStep` for older saves, never lowered) and both main menus render a code-drawn badge row for every domain the child has actually met: sprout / leaf / flower / star from `trophies.tierSteps` in the shared math_tuning.json. Web draws with Graphics; Godot with a new TrophyBadge Control (`_draw` primitives — no glyph icons, per the house rules). A demotion never shrinks a badge.
- 2026-08-24: Documented the standing art contingency in roadmap.md (P4 "Code-drawn UI stand-ins need a real art pass"): trophy badges, progress pips, golden frame, recap panel, and celebration bursts are all drawn in code pending a real pixel-art/UI pass; the SFX entry now counts all 16 synthesized effects.
- 2026-08-24: Phase 3 verified: tsc clean, `npm run validate` green, Godot suite 73 passed + all integration probes, browser smoke accepted, `output/web` re-exported and the play smoke clean against it.
- 2026-08-24: Beating-heart Phase 4 — the per-level math mixes got their design pass. The skill story: 01 Forest counting (+addition, band 1-2), 02 Cave subtraction (+addition), 03 Meadow comparison (+counting), 04 Bridge pattern matching (+counting), 05 Treetop number sequences (+addition, subtraction), 99 Arena everything — each headline's prerequisite domain is the level's own on-theme fallback until the headline unlocks, and counting play in 01/03/04 is exactly what unlocks patterns. Every mathGating now carries a required teachingIntent sentence (spec schema enforces it), mirrored into both registries.
- 2026-08-24: Design-pass bug found by questioning the design: the owl built its allowed-domain list in NPC-config order, so a level's headline skill would silently lose the 70% primary share to whichever domain the NPC listed first. Both ports' components now keep the LEVEL's skill order through the gating intersection — the first listed skill is the headline. Level 05's dead band value ([1,4] against an NPC cap of 3) is authored honestly as [1,3].
- 2026-08-24: New validate guards for the curriculum chain: registry mathGating must equal its spec (and the Godot registry must be byte-identical), every gated skill must be servable by the owl and backed by at least 30 problems inside the level's band, every gating names its intent, and the chain as a whole must cover all six servable domains. Fixed an upstream red on main while merging it in: the language-selector comment merged as #10 contained a literal flag emoji that the src glyph allowlist rejects; it is prose now.
- 2026-08-24: Localisation endgame, planned through Lead Producer. The plan overturned my own instinct on the way in: the roadmap claimed mid-game language switching "would require live re-rendering of HUDScene, TouchControls, DialogBox and any open MathChallengeScene overlay", which was simply wrong — seven web components already re-render in place on `THEME_CHANGED` with proper off-on-destroy, so locale needed the same treatment on the same bus, not a new mechanism. `GameEvents.LOCALE_CHANGED` and Godot's `locale_changed` were emitted with zero listeners in either port: dead plumbing that read as if the feature existed.
- 2026-08-24: Pause is now the settings surface. Both ports gained a language row (flag + endonym — "Tungumál: Íslenska" is 272px in a 200px button, and the flag carries the meaning anyway) and the web gained the forest/scifi theme row the Godot port already had, so the two stop disagreeing. Switching either re-renders live: touch labels go JUMP/ZAP/PECK -> STÖKK/SKOT/GOGGA and the Godot HUD's Lives/Coins/Owls -> Líf/Mynt/Uglur, with GameScene never restarting. `MathBoard.onLocaleChanged` re-renders from `currentProblem` only and goes through `fitInto` rather than `setText`, so a language change can neither swap the problem under a child mid-answer nor leave a longer prompt overflowing the board. Chose to build the web theme control rather than delete the Godot one: `theme_scifi.json` is referenced by no level data, so deleting would have stranded shipped content, and the seven-subscriber re-render system was already built and merely unreachable on the web — this is the first thing that has ever triggered it at runtime.
- 2026-08-24: Deleted `hud.level`, `hud.level_up`, `login.delete`, `login.delete_confirm` behind a real guard rather than by hand. `validate_i18n.mjs` now fails on any bundle key nothing renders, with a declared `DYNAMIC_PREFIXES` allowlist for the four families built at runtime (`domain.`, `level.`, `theme.`, `math.prompt/hint/expl.`) — the eight `domain.*` maths terms look dead and are live, so a naive grep would have deleted them. Watched it flag a planted dead key, watched it not flag `domain.*`, and watched undeclaring the prefix flag all eight, which is what proves the allowlist is the load-bearing part.
- 2026-08-24: Retired the "a third locale is now cheap" roadmap entry — it failed the roadmap's own rule that entries be actionable, since no third locale exists or is planned. Its cost is recorded in DEVELOPMENT_GUIDE.md instead, where a cost estimate belongs.
- 2026-08-24: **Fixed a systemic hole in the Godot test runner.** It called each test with `instance.call(mname)` and read the failure count immediately, so for any test containing `await` every assertion after the first frame boundary went uncounted. Five tests across three suites were affected. Awaiting the call turned `test_touch_controls.gd::test_a_touch_on_the_dpad_presses_its_action` red on the first run — a test I had cited earlier in this session as proof the d-pad works, and on whose strength I retracted a correct diagnosis. It had never verified anything.
- 2026-08-24: Established the touch verification properly instead of patching the broken test. Probed headless input: injection reaches nodes fine (both `Input.parse_input_event` and `Viewport.push_input` deliver an `InputEventScreenTouch` to `_input`), and the coordinates were right (`shape_centered` is false on these buttons), but `TouchScreenButton`'s screen-to-canvas hit testing does not work without a real window. So the press assertion moved to `tools/godot_play_smoke.mjs`, which now taps the d-pad with genuine DOM touch events in a `hasTouch` browser context — the same technique that verifies the web port's touch labels. The headless suite keeps only what a headless tree can answer. Browser evidence is positive — held CDP touches move the world at 0.998 change, matching a keyboard walk, with real DOM touchstart confirmed reaching the canvas — but there is deliberately no assertion yet: a sequence of held touches contaminates itself once the owl overlay opens and captures input, and a gate that passes on ordering is worse than none. Recorded on the roadmap as evidence-without-a-gate rather than claimed as covered.
- 2026-08-24: Two process corrections. `npm run validate` had been checked with `grep -ciE "FAIL"`, which never matches the i18n guard's "N problem(s)" — so main was merged red, with a flag emoji sitting in a `LanguageToggle.ts` doc comment warning against flag emoji. Exit codes only from here. And a new `tools/pause_settings_check.mjs` (in web CI) drives the Pause settings end to end; it was watched failing when the TouchControls subscription is removed, and it refuses to pass vacuously if `hasTouch` did not apply.
- 2026-08-24: The dead-key guard earned itself on its first merge: `trophy.title` ("My badges" / "Merkin mín") shipped into all four bundles with the trophy shelf two commits earlier and nothing ever drew it. Deleted rather than wired up — adding a heading changes the main menu's layout, which belongs to whoever designed the shelf — and recorded on the roadmap so the intent is not lost.
- 2026-08-24: The deploy artifact is guarded by content now, not trust. `output/web` is what Railway serves, it is hand-built and committed, and nothing checked it matched `godot/**` — it drifted a whole feature behind once and cost a play session. `godot/tools/build_web.sh` records a sha256 of every source that feeds the export into `output/web/build_fingerprint.json`, and `tools/validate_export.mjs` (in `npm run validate`, which CI's unfiltered validation job runs) recomputes it and fails on drift. Deliberately a hash, not the mtime comparison the roadmap proposed: git does not preserve mtimes, so a fresh clone stamps everything with the checkout time. Note content addressing does NOT already solve this — an export built from old sources still gets a perfectly valid `index.<buildId>.pck` name. Excluded from the hash: `build_info.json` (a build timestamp), tests, tools, and `.import` sidecars. Watched it stale on a script edit and on a data edit, and correctly ignore a test edit.
- 2026-08-24: The post-wrong-answer lockout is one deliberate duration and it is visible. `RETRY_LOCKOUT` was 600ms from `ui_tuning.json`, which is shorter than the feedback it exists to cover — the wrong-answer tint and the hint fading in both outlast it, so the board re-enabled underneath its own animation. Answer-feedback pacing moved into `data/tuning/math_tuning.json` as a `feedback` block beside every other tunable math number, with the lockout at 900ms, and the options now dim to 0.45 while input is held and come back when they are live. A control that looks tappable and is not gives a child silence with no reason for it.
- 2026-08-24: Two defects found doing that. `math_challenge.gd` read `current_problem["hint"]` raw on the first wrong answer instead of going through `_localised()`, so an Icelandic player got the English hint at exactly the moment they needed help most — the reveal path had been localised and this one was missed. And the first dimming attempt used `modulate`, which `UiFx.attach_focus_highlight` also tweens, leaving the focused option lit while its neighbours faded; the new test caught it as "3 dimmed, 1 still lit" and it moved to `self_modulate`, which composes instead of fighting.
- 2026-08-24: This work was written against the pre-deletion tree and re-applied onto the Godot-only one after #15 landed. The web half (MathBoard, MathChallengeScene, the `public/` tuning mirror) was dropped rather than merged — it targets files that no longer exist. Also nearly reported main's `npm run typecheck` as broken: it fails only with a stale `node_modules` from before `@types/node` was added, and `npm ci` clears it. Checked against clean main before saying anything.
- 2026-08-24: Verified: 99/99 Godot tests (three new in test_answer_feedback.gd, one of which caught the modulate conflict), npm run typecheck clean, npm run validate exit 0 including the new export gate, and the export regenerated with its fingerprint.

- 2026-08-25: Post-restructure audit of main after the multi-agent merge wave (Phaser tree removed, math truth moved to math-kernel, board/HUD/menus rebuilt, owl roster + streak added). Verdict on the math-experience systems built here: everything survived with behavioural parity, verified by running, not by reading - 120 unit tests green including the golden-roll/ladder/ELO parity fixtures, the owl probe drives demo -> answer -> owl_saved with the identical ELO delta (150 -> 155.60), and the rebuilt board still carries the tuning-paced teaching beats, progress pips, golden frame and golden coin multipliers; the menus still carry the recap and trophy shelf; gating still keeps the level's headline order.
- 2026-08-25: Fixed what the audit found red or noisy on trunk. The two mechanical validate reds: compiled-level drift for levels 05/99 (recompiled) and the stale committed export (rebuilt; the new freshness guard and the boot smoke both pass). Two boot-time script errors: String(null) crash loading the mute preference (str() now), and complete_level crashing on saves that predate completedLevels (backfilled). Post-rebuild debris: 21 dead i18n keys deleted from both bundles (including hud.level/hud.level_up/login.delete/login.delete_confirm, which closes the old four-dead-keys roadmap item), 4 stale fit-budget rows removed, ONBOARDING count snapshots synced (6 NPCs, 287 keys), required doc headers added to the two new asset-slot READMEs, and validate_assets now understands declared drop-in art slots (board-9slice, count-token-32, owl-icon-32) whose absence is the designed state.
- 2026-08-25: Known non-blockers left on purpose: tools/godot_play_smoke.mjs predates the menu rebuild and the cloud-save POSTs and is no longer the CI gate (web_boot_smoke.mjs is, and passes); the owl-ring streak flame is celebration-only but sits in mild tension with the documented "nothing to protect" kid-safe rule - flagged for the design owner, not reverted.
- 2026-08-25: Analytics, phase one of three audiences. Owner: a token-gated admin surface (`CROW_ADMIN_TOKEN`, off-means-404, header-only) serving `/admin` - a self-contained dashboard with KPI tiles (active kids, sessions with median length from 30-minute gap-splitting over attempts, D1/D7 retention shown as n-of-cohort, lifetime answers, first-try accuracy, open error groups) and four 28-day single-series charts, all inline SVG with hover tooltips, light/dark. Errors: the existing fingerprint-deduplicated error_groups finally have a read side - list by status, triage transitions (acknowledge/resolve/ignore) from the dashboard, so bugs are debuggable without player feedback and without spam.
- 2026-08-25: Parent report. New device-authed, RLS-scoped `GET /api/v1/family/children/{id}/report`: every attempt the family has ever synced, rolled up per domain (with current/highest step and effective skill score from the save blob) and per problem kind - equation / word problem / visual counting - classified by a generated problem catalog (tools/gen_problem_catalog.ts) that uses math-kernel's own parseWordedArithmetic, emitted as a TS module so the API Docker build ships it untouched, with a pools-hash freshness gate in npm run validate. The in-game ParentReport scene now renders the cloud matrix colour-coded (green >=85%, amber 70-85%, red below - thresholds and hexes in ui_tuning, not code) with counts per kind, and falls back to the local recent window with an explicit "this device only" label when not enrolled. Server tests cover admin auth off/wrong/right, error triage round-trip, the rollup shape, retired-problem fallback, and family isolation (a stranger family gets 404).

- 2026-08-25: Icelandic grade mapping shipped end to end. Researched primary
  sources (lög um grunnskóla 91/2008 15. gr. school-start rule; aðalnámskrá
  25. kafli — criteria only at grades 4/7/10; MMS Sproti 1a–4a per-grade scope)
  into docs/GRADE_EXPECTATIONS.md and the canonical
  godot/data/curriculum/grade_expectations.json (provenance per milestone,
  generated into server/src/generated/gradeExpectations.ts with a freshness
  hash). children.birth_year (YEAR only, migration 005) collected optionally at
  profile creation and backfillable from the parent report; report endpoint now
  derives the grade and a per-domain band verdict (ahead / on track / practice
  together / not expected yet — leikskóli has no floor by design) from
  highestStep, rendered color-coded in parent_report.gd. New guards: generated
  copy freshness, every owl-served domain must have milestones, milestones must
  point at authored ladder steps, provenance required. 42 server + 154 Godot
  tests green, export rebuilt.

- 2026-08-25: Grade 3-4 math coverage shipped through the authoring pipeline.
  Research-based step redesign documented in docs/MATH_AUTHORING_STANDARDS.md
  (fluency phases, one-difficulty-factor-per-step, regrouping-load ordering,
  measured times-table order, CGI word-problem taxonomy). Ladders extended:
  addition/subtraction steps 41-46 (3- and 4-digit by carry/borrow count,
  frozen tiers untouched), multiplication rebuilt on the table-order ladder
  0-14 (legal: never served), division as fact families (mult step + 1),
  comparison to step 9 (ordering past 1000), sequence to step 9 (skip counting
  by 10/25/50/100). ~700 new problems via 9 new batches + 10 new bands; two
  new word-problem shapes (equal-groups nests x, sharing berries division)
  wired through the kernel parser, phrasing catalog and both locales, with a
  new strictVariants template flag so story-only templates stay stories.
  Multiplication/division now servable: added to all owl problemTypes
  (unlock-gated by addition mastery) and to level_05 + level_99 gating
  (difficultyBand to [1,5]). grade_expectations.json now anchors grades 3-4
  in every extended domain. 43 server + 154 Godot tests green, full validate
  clean, export rebuilt. Deferred with roadmap entries: remainders (needs a
  new answer mode), fractions/negatives (new domains).

## 2026-08-25 — Concept ladder and click-through lessons

Original prompt: teach a step-by-step, skippable, click-through tutorial for every level of maths problem, in both languages, easy to restyle for a UI/UX pass; group the problems architecturally; identify what is missing.

- The gap this closes: the learner model knew how HARD a problem was
  (`curriculumStep`, 0-36 per domain) and nothing else. Step 6, step 9 and step
  30 were all "addition", so the moment a genuinely new idea arrived — carrying,
  bridging past ten, place value — was invisible and nothing could trigger on
  it. The one teaching moment that existed fired once per domain, ever.
- Added the grouping layer as data: `godot/data/curriculum/concept_ladder.json`,
  30 concepts over the 8 domains, contiguous step ranges covering all 3150
  authored problems with none left outside. `concept_ladder.gd` is the lookup
  and is pure; seen-state is a new `TutorialManager` autoload persisting through
  `SaveManager` (`tutorialsSeen`, profile-scoped).
- Deliberately NOT in `learner_state_manager.gd`. That file is parity-locked
  against the kernel's golden fixtures; teaching is a product decision that will
  change often, and putting it there would make every lesson tweak Tier-1.
- 30 lessons, 120 cards, in `godot/data/curriculum/tutorials.json`. Four beats
  each, in the order the evidence supports for a novice: concrete, pictorial,
  worked example, guided try. Sources are cited in
  `docs/MATH_CONCEPT_LADDER.md` rather than asserted.
- Ten representations drawn in code (`tutorial_visual.gd`): ten-frame, number
  line with hops and a landmark, base-ten rods, equal groups, unifix towers,
  pattern strip, take-away with crosses, count-all, sequence, equation. Adding an
  eleventh is one `RENDERERS` entry plus one `_draw_` function.
- Every pixel, delay and colour role is in `godot/data/tuning/tutorial_tuning.json`,
  including a `roles` map from each drawn part to a palette role. Nothing a
  designer needs to move lives in a `.gd`.
- 155 new string keys, English and Icelandic, key-for-key. Bundle is now 449.
- Where it fires: `math_challenge_component.gd` asks twice — on first contact
  with a domain (replacing the silent demo), and when a selected problem's own
  `curriculumStep` lands on an unmet concept. Keyed off the PROBLEM's step, not
  the learner's: the comfort and stretch lanes routinely hand out a problem a
  rung either side of the ladder's position. The problem is held across the
  lesson so the child is asked what they were just taught.
- `tools/validate_math_concepts.mjs` (wired into `npm run validate`) recomputes
  every number all 120 cards assert from the picture it is drawn on. It caught a
  real teaching bug on first run: `division.sharing`'s guided question sat on an
  equal-groups picture, which asserts the TOTAL, while the question asked how
  many were in each box — the card would have marked 4 correct against a picture
  of 8. It also caught three Icelandic lines over their fit budget.
- The same guard turns "what is missing" into a build gate. Fifteen rungs have
  no problems on them and twelve more have fewer than six; all are declared in
  `concept_ladder.json` with a reason, and an undeclared gap — or a declared one
  that has since been filled — fails the build. `reports/math-concepts/coverage.json`
  is the generated inventory. The two that matter for a child playing today are
  `subtraction` steps 17-20 and `addition` step 20; both are now in `roadmap.md`.
- `bash godot/tools/capture_tutorials.sh` renders every card to PNG, in either
  language and any theme. It found two real bugs immediately: the board
  overflowed a 960x540 screen with the Next button off the bottom edge, and
  `token_c` mapped to `coin`, which is the same hex as `accent` in emberwood, so
  the second and third slot of every pattern lesson were identical there.
  `test_theme_roles.gd` now fails the build on the latter.
- `owl_probe.gd` drives the whole chain against the real scene tree and asserts
  the lesson happened: owl -> lesson -> four cards -> guided answer -> freebie
  question -> learner update. It was the failure that proved the wiring was live.
- Verification: `bash godot/tools/run_tests.sh` green (174 unit tests across 33
  suites, 6 probes, hardcode/asset/reachability guards), `npm run validate`
  green, `npm run typecheck` clean, `bash godot/tools/build_web.sh` +
  `node godot/tools/web_boot_smoke.mjs` green with 0 console errors.
- Not verified: `tools/godot_play_smoke.mjs` fails at profile creation in this
  environment, identically on the pre-change export — a harness/environment
  issue, not a regression. It is not part of `run_tests.sh` or `npm run validate`.
- Also not verified: whether these lessons actually teach a real five-year-old
  anything. No artifact in this repo claims that, and this one does not either.
  The evidence cited is for the instructional pattern, not for this
  implementation of it.

## 2026-08-25 - Relational equals and missing addend

Original prompt: implement the highest-value absence the hardening review found - "=" is never a relation, and every addition problem is result-unknown.

- Routed through LP, which collapsed three stated decisions into one and forced a
  fourth candidate into the comparison. The winner was none of the three
  originally proposed.
- What made it cheap: only `problems_curriculum.json` is generator-owned
  (`math_authoring.ts:1936`). `easy`, `gaps` and `dataset` are hand-authored, so
  new problem content needs no generator work and no 3035-problem regeneration.
  That single fact removed most of the projected blast radius.
- What made it possible at all: `deriveCurriculumStep` already dispatches on
  domain for non-arithmetic prompts, and `answer.correct` is schema-typed as
  anything. The seams existed.
- THE DESIGN: overlays. A concept may declare `"requires": {"skill": "..."}` and
  is then matched by what a problem IS rather than by how hard it is.
  `ConceptLadder.overlay_for_problem` is tried before the step ranges.
  "5 + ? = 8" derives onto the same rung as "5 + 3 = 8" - correctly, it is the
  same bond - so on step alone the child would have been handed the make-ten
  lesson, which teaches nothing about where an unknown may sit.
- Overlays never claim a step, so the ladder's "contiguous from 0" guarantee is
  untouched. Rejected alternatives: a 9th domain (touches MathDomains, the
  golden fixtures, the unlock graph, all six owls' problemTypes, a
  parent-report row and a level's mathGating), and re-keying the ladder on shape
  (destroys the partition invariant). A cross-cutting concern must not become a
  sibling of the things it cuts across.
- The same mechanism is what carrying will use: `requiresCarry` is on 995
  problems, spread 40-50% across every two-digit step, and has never been
  expressible as a step range.
- VERIFIER INTEGRITY was the real work. `parseArithmeticPromptIndependent` is a
  first-match scan, and on "4 + 3 = ? + 5" it returns {4,+,3} and reports 7 when
  the answer is 2. Meanwhile `validate-content` skips both its answer check and
  its trait check when the parse comes back null - so "5 + ? = 8" would have
  shipped with neither its answer nor its operands ever independently
  re-derived. Fixed three ways: `parseRelationalPrompt` with ANCHORED patterns
  (nothing can be half-recognised); the generic parser now refuses relational
  text outright; and `isUnrecognisedEquation` names the shapes nothing
  understands so `validate-content` refuses them instead of verifying them
  wrongly. Verified against all 3150 pre-existing problems: zero false positives.
- Content: 20 problems hand-authored into `problems_gaps.json`, all totals ten
  or under, steps 2-7, every one servable under the operand cap. Twelve
  missing-addend ("a + ? = c", "? + b = c"), eight relational ("c = a + ?").
  Step and traits stamped by the repo's own `math:sync-metadata`, so both are
  DERIVED and verified rather than authored. Distractors are the actual errors:
  the total (operator-as-command) and an off-by-one on the part.
- Two lessons, 8 cards, EN + IS. Two new renderer pieces, each the standard
  representation for its concept: `part_whole` (the bar model - "5 + ? = 8" is
  eight things of which five are visible, not five things and a mystery), and
  `equation` learning `form: "total_first"` plus an interior unknown, so
  "9 = 4 + ?" can be drawn at all.
- My own new guard caught my own bug: it flagged the balance try card as
  asserting 9 when the truth was 5. It was right that something was wrong and
  wrong about what - on the interior-unknown form `result` is the WHOLE, not the
  answer. The check now only treats `result` as an answer-assertion when the sum
  is complete.
- Guard also gained: overlay minimum-content and declared-span checks, a
  no-two-overlays-claim-one-skill check, and report attribution that mirrors the
  runtime's overlay-then-step rule. That last one mattered - counting by raw step
  range reported 17 phantom skill drifts the moment the first overlay landed.
- Negative-tested: authored "4 + 3 = ? + 5" into the pool and confirmed
  validate-content refuses it by name. That test's `git checkout` restore then
  wiped the 20 uncommitted problems, and the two reachability tests failed
  within seconds - which is the tests doing exactly their job.
- Pipeline note for next time: `npm run math:materialize` is two steps.
  `materialize_math_batches.ts` STRIPS `phrasing` from every problem and
  `npm run math:phrasing` re-derives it. Running only the first leaves the pool
  looking catastrophically changed (all 3035 problems "different"). After both,
  `problems_curriculum.json` is byte-identical.
- Verified: 180 tests across 33 suites, 6 probes, all guards, npm run validate,
  typecheck, export rebuilt and boot-smoked with zero console errors. i18n guard
  round-trips 8723 phrasings, up from 8683 - the 40 new ones are semantically
  verified, not merely present.
- NOT done, and now the whole of the roadmap entry rather than its preamble:
  two-sided equations ("4 + 5 = ? + 6", the form Falkner et al. actually tested)
  are refused by name until the verifier learns them; no relational problem
  exceeds a total of ten; and subtraction has no relational or missing-part
  shape at all.

## 2026-08-25 - Merging the concept ladder with the grade 3-4 work

- Two sessions landed on the same files in parallel: the grade 3-4 ladder
  (~700 problems, mult/div live, three-digit and four-digit arithmetic) and the
  concept ladder with its lessons. Merged deliberately rather than by picking a
  side, and nothing was dropped from either.
- The i18n bundles were a clean union: 169 keys only in mine, 33 only in main's,
  294 identical, ZERO where both sides changed the same key, and nothing deleted
  by either. Checked with a real three-way diff before merging rather than
  trusting the conflict markers. Result 506 keys per locale.
- `problems_gaps.json` auto-merged and kept both: main's 60 plus the 20
  relational problems. `progress.md` kept both logs. `roadmap.md` kept all 25 of
  main's entries plus 8 new. Generated files (`output/web/**`,
  `reports/math-batches/**`) were regenerated rather than resolved by hand.
- THE LADDER NEEDED REAL EXTENSION, and the guard is what said so precisely:
  addition and subtraction now reach step 46 (four-digit), comparison and
  number_sequence reach 9 (three-digit). Four new rungs authored to cover them.
  `multiplication.tables_large` and `division.larger` were SHRUNK to 13-14 and
  15-15, because main's content stops before my declared ranges did and a rung
  with nothing on it is a rung nothing can teach.
- The gap declarations were rewritten from measurement, not edited. Main's work
  CLOSED multiplication steps 0-5 and division 1, 2, 4, 5 - the guard listed
  every one of them as "declared but no longer is", which is exactly the
  discipline it was built for. New holes at addition/subtraction 37-40,
  multiplication 11, division 7 and 12.
- Two of the four new rungs got lessons (`comparison.compare_larger`,
  `number_sequence.big_skips`). The multi-digit pair carries `tutorial: null`
  ON PURPOSE: every problem in them has an operand between 121 and 4788 and the
  owl caps at 20, so a lesson there would be the same waste the hardening review
  found four of.
- FINDING WORTH ACTING ON: division went live but the cap blocks 72% of it.
  Multiplication is fine (531/588 servable, because its maxOperand is
  `max(left, right)`), but division's is `max(dividend, divisor, quotient)`, so
  `24 / 3` reports 24 and is dropped - while the multiplication fact `3 x 8`
  that answers it is served. `division.tables` and `division.larger` are
  entirely unreachable. Declared, documented, and in `roadmap.md` as a decision
  about which number represents division's difficulty. Not silently changed:
  re-deriving traits for 383 problems is main's territory.
- The answer-position guard caught me a second time: all three two-option
  guided tries had the correct answer in the same slot. Fixed.
- The doc's gap and unreachable sections are now GENERATED from the
  declarations in `concept_ladder.json`, quoting each reason verbatim, because
  hand-paraphrasing them is how the doc and the data drift apart - and the guard
  was already failing on exactly that.
- Verified on the merged tree: 180 Godot tests, 6 probes, all guards,
  npm run validate, typecheck, export rebuilt and boot-smoked with zero console
  errors, main's analytics catalog regenerated with its own tool, and main's
  server suite still green (18 pass, 0 fail; the Postgres-backed cases need a
  DATABASE_URL this environment does not have).

## 2026-08-25 - Division reachability, and five rungs that were never fillable

Original prompt: fix the division cap, the four-rung subtraction hole and addition step 20.

- DIVISION WAS A BUG, not a decision, and the codebase already said so.
  `deriveCurriculumStep` calls `deriveDivisionStep(divisor, quotient)` and has
  never looked at the dividend, while `deriveDifficultyTraits` reported
  `maxOperand` as `max(dividend, divisor, quotient)`. So `24 / 3` read as a
  twenty-four and the owl's cap of 20 dropped it, while the multiplication fact
  `3 x 8` that answers it sailed through at eight. Same fact, two verdicts.
  Fixed to `max(divisor, quotient)` in both derivations. Division servability
  went 108 -> 336 of 383 problems, and `division.tables` and `division.larger`
  came off `knownUnreachable` - the guard demanded it, which is the discipline
  working in the closing direction for once.
- Checked first that this was not Tier-1: the golden fixtures contain no
  `difficultyTraits` and no `maxOperand` at all, so the change is offline tooling
  plus a re-derive, and `validate-content` re-checks every stamped trait.
- THE OTHER TWO ITEMS TURNED OUT TO BE IMPOSSIBLE, and I nearly authored 24
  problems before finding out. My first enumeration reimplemented the step
  formula from memory and reported 20-21 available facts per rung. Calling the
  REAL `deriveCurriculumStep` instead reported zero. Main had rewritten those
  ladders; my copy of the formula was stale.
- The truth: no fact whose operands and result stay inside twenty derives onto
  `subtraction` steps 17-20 or `addition` step 20. Addition step 20 needs
  maxOperand 20 WITH a carry, and 20's ones digit is zero, so nothing can carry
  into it. Subtraction 17-20 need operands above twenty, which the cap drops
  anyway. `subtraction` step 15 has exactly three possible facts, so three is its
  ceiling rather than a shortfall.
- So the fix was not authoring. It was: correct three declarations that recorded
  authoring debt where there is none, and turn "harmless" from an assertion into
  a test.
  `test_promotion_can_step_over_every_impossible_rung` asserts that the rung
  before each hole finds content within `promotionStepScanLimit` and that the
  landing step clears the hole entirely - so subtraction goes 16 -> 21 and
  addition 19 -> 21, and no child stalls.
  `test_the_impossible_rungs_are_still_empty` fails if the derivation ever
  changes underneath the declaration.
- roadmap.md: the division entry is deleted because it is done. The two
  "fill this hole" entries are replaced by the question they actually turned out
  to be - whether a magnitude-derived ladder with permanent holes is the right
  shape, or whether the derivation should produce a dense sequence. Dense
  numbering would make "step 12 of 20" mean something in a parent report and
  remove five permanent exceptions, at the cost of renumbering every problem.
  Not small, not urgent, and now written down instead of assumed.
- The ladder doc now marks which gaps are UNAUTHORED and which are
  STRUCTURALLY IMPOSSIBLE, because the two need completely different fixes and
  the previous list read as though every one of them was waiting for someone to
  write problems.
- Verified: 182 Godot tests, 6 probes, all guards, npm run validate, typecheck,
  live build rebuilt and boot-smoked with zero console errors, analytics catalog
  regenerated, server suite green (18 pass / 0 fail; Postgres-backed cases need a
  DATABASE_URL this environment lacks).

## 2026-08-25 - Relational maths across both operations, and the form the research tested

- One parser pass covered all three roadmap items, which is why they were
  sequenced that way: `parseRelationalPrompt` went from three addition-only
  patterns to four shapes across two operators, and each pattern now carries its
  own reader. "5 - ? = 2" and "? - 3 = 5" are not the same question and must not
  be verified as though they were.
- Added `fact: [left, right]` to the parse result - the plain arithmetic
  underneath, in an order that matters. "? - 3 = 5" is the fact `8 - 3`, and the
  minuend has to come first for both the borrow rule and the step derivation.
  `deriveCurriculumStep` now routes by operator, so a relational subtraction gets
  the rung its plain fact would earn.
- TWO BUGS IN MY OWN WORK, caught by probing rather than by assuming.
  `8 + 7 = ? + 6` reported maxOperand 9 when the child has to work inside
  FIFTEEN - the total nobody writes down was missing from the operand list, and
  the cap would have admitted a problem it should refuse. And its carry flag was
  computed from the wrong pair: the carry lives in the 8 + 7, not in the known
  and unknown.
- 46 new problems, all inside the operand cap: relational addition widened to
  totals of twenty, subtraction Change Unknown and Start Unknown, and twelve
  two-sided equations. 66 relational problems in total across six overlays.
- Four new lessons, EN + IS. Reviewing the cards before trusting the guard found
  two teaching errors it could not have caught, because both were internally
  consistent: the start-unknown try card asked for the part that WENT when the
  lesson is about the start, and the subtraction balance card had the same
  mismatch. `part_whole` can only ever assert the missing part, so both became
  equations with the unknown in the slot the lesson is about.
- That needed a renderer gap closed: the unknown can now lead
  ("? - 4 = 9"), which is the only way to draw start-unknown at all.
- MY GUARD CHANGE BROKE FIVE EXISTING CARDS and said so immediately: collapsing
  the equation truth into +/- turned `5 x 7` into `5 - 7` and reported -2.
  Restructured to keep the operator switch for a complete sum and add the
  missing-slot cases beside it.
- The equality card was colouring one side green. `addition.both_sides` opens on
  two towers of seven, and highlighting one of them says the opposite of what the
  card is for. A previous pass had already restructured that code around `ask`,
  so the first fix landed in the wrong branch and the capture is what caught it.
  Captures are worth taking even when the guard is clean.
- Also restored a documentation section I had destroyed earlier: "What is not on
  the ladder at all" was consumed by one of my own generated-section rewrites,
  taking the subitizing, commutativity and CGI-compare analysis with it.
  Recovered from git and updated rather than left lost.
- Verified: 184 Godot tests, 6 probes, all guards, npm run validate, typecheck,
  live build rebuilt and boot-smoked clean, analytics catalog regenerated, server
  suite green.
- Left undone on purpose: nothing relational exceeds a total of twenty, and
  multiplication and division have no relational form. Both in roadmap.md; the
  first is blocked on the operand-cap decision rather than on the parser.

## 2026-08-25 - Making the lessons legible in all seven worlds

- I had only ever looked at these cards in emberwood. Auditing all seven palettes
  by contrast ratio rather than by eye found two real defects, and one of them was
  a test of mine that was passing while the thing it guarded was broken.
- `token_c` was below 3:1 against the board in SIX of seven themes - 1.16:1 in
  prism_hollow, which is invisible. My own earlier "fix" caused it: swapping the
  third pattern slot from `coin` to `primary` stopped it matching `accent` and
  made it unreadable instead. The test I wrote at the time asserted the three
  colours were DIFFERENT HEX VALUES. They were. Testing identity where the
  requirement is perceptibility is exactly how that got through.
- Searched every role in every palette for a third colour that is legible on the
  board AND distinct from the other two, in all seven themes. Two qualify:
  `hurt` and `spike`, the damage colours. So this is not a palette-picking
  problem - colour cannot carry a three-way distinction here at all.
- The repeat is carried by SHAPE now: circle, square, diamond, with colour
  reinforcing. Works in every theme by construction, and it is what a child who
  cannot separate the colours needed anyway. `token_c` is deleted from the tuning
  file with the reason recorded beside the roles that remain, and the lesson copy
  says "the shapes show you where" in both languages because the copy has to
  follow the carrier.
- Replaced the bad test with one that measures WCAG 1.4.11 contrast for every
  drawn part against the board, in every theme, and negative-tested it by
  pointing `token_b` back at the invisible colour: it fails per theme with the
  measured ratio.
- Text contrast was already fine everywhere (5.5:1 to 16:1), so the audit's one
  genuine finding was in the drawn parts - which is where I had never looked.
- Careless moment worth recording: `git checkout` on the tuning file to undo the
  negative test silently reverted the uncommitted token_c removal, the same trap
  that wiped twenty problems earlier in this session. Checked, reapplied, and
  staged first this time.
