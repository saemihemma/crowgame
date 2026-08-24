# Pre-mortem: taking Crow public

Status: Current
Authority: Launch risk register and the reasoning behind each mitigation. What
actually shipped is in the code; this records why.
Last verified against code: 2026-08-24

## The decision

A solo maintainer opens a child-first maths game to strangers' families: public
URL, indexable, no invite gate, children roughly 5-7 on iPads, often unsupervised.

**What is actually hard to undo** is not the deploy — deploys roll back. It is the
first twenty families' impression, which travels parent to parent, and any child's
lost progress, which had no recovery path.

**Failure, defined:** within about six weeks the owner turns it off; or a parent
who tried it warns another parent away; or — the quiet one — the owner cannot tell
whether either happened.

## Story 1 — "The silent iPad" · was BLOCKING · fixed

Six weeks in, forty families have opened the URL. The errors table is empty. The
owner concludes nobody came. People came; some got a dark-red failure box, and
nothing recorded it.

The chain, all of it verified in code before fixing:

1. **The boot-failure hook was dead code.** `crow-errors.js` wrapped
   `window.displayFailureNotice`. The shell declares that function *inside its own
   IIFE* and never puts it on `window`, and because the shell passes it directly
   as the `startGame()` rejection handler, a boot failure fires neither an `error`
   event nor an `unhandledrejection`. The file's own comment called this "the
   single most valuable signal here". It was unreachable.
2. **No success beacon**, so no denominator.
3. **No access log.** Caddy 2 writes none without an explicit `log` directive.
4. **No attempts recorded**, because every family route needs a device cookie,
   which needs an email that could not be sent.

So an empty errors table meant *nothing at all*: no players, total boot failure
and everything in between looked identical. This is the risk that hid every other
risk here.

**Shipped:** `Engine.prototype.startGame` is patched from `crow-errors.js` (the
only point both the shell and the reporter can see), reporting `engine_boot` as
fatal on rejection. Two `level: 'info'` beacons on the existing `/api/v1/errors`
endpoint — `boot_start` on script load, `boot_ready` from `boot.gd` once a real
scene is up — give the funnel. `boot_ready` carries `hadExistingSave`. The Caddy
access log is on. The e2e harness now asserts both beacons landed in Postgres;
previously it asserted only that `window.crowReportError` *existed*, which is
precisely why this slipped through.

## Story 2 — "Safari ate her crow" · hedged, not solved

A six-year-old plays three sessions, earns a named crow and 200 problems of
history, doesn't play for nine days, and opens a brand-new game. She cries. Her
parent files no bug; they tell one other parent it "lost everything".

All state lives in `user://crow_localstorage.json`, which is IndexedDB on the web
export. **iOS Safari deletes script-writable storage after 7 days** of browser use
without first-party interaction. Cloud save is the designed recovery — and it was
unreachable, because the mailer falls back to a log-only driver, so every install
was local-only and seven days from zero. Worse, `request-link` returned
`202 {sent:true}` regardless and the panel rendered "check your email", so a
parent acting to protect their child's progress was told it worked.

Two separately-accepted risks — "no mail provider yet" and "storage eviction
unproven" — were the same failure once multiplied. That is the whole reason to
reason backward from failure rather than keep a risk list.

**Shipped:** the home-screen install instruction, in `PRIVACY.md` and in the cloud
panel itself, because a home-screen web app is not subject to the 7-day cap and
the `apple-mobile-web-app-capable` plumbing already existed — the instruction did
not. And `request-link` now returns `delivery: "configured" | "unavailable"`, with
the panel saying so plainly. That distinction leaks nothing: it is a server-config
fact, identical for every caller, unlike whether an address is known.

**Still open, and it is the owner's:** configure a mail provider, and open the game
on a real iPad. Until the first, roughly a third of the server is dark code in
production. The second cannot be simulated — Chromium at an iPad viewport does not
prove WebKit's eviction, audio unlock, or memory ceiling for a 33.7 MB wasm.

## Story 3 — "The game decided she's bad at maths" · already fixed on main

A seven-year-old plays a fortnight and every problem stays trivially easy. She is
bored; the parent's read is "it's a baby game, it doesn't teach anything". Or the
mirror: a struggling five-year-old is pinned at step 0 forever and the parent
concludes it doesn't adapt.

**This section is a retraction.** It was written against a branch that had fallen
twelve commits behind `main`, and it proposed a fix — filtering demotion's
wrong-count arm to `at_level` misses only — that was written, simulated, and
reverted here (it bought one step of depth in addition at the cost of subtraction
never unlocking). All of that is moot: `main` had already fixed the ratchet, by a
better route, in "Make math difficulty actually progress" (#5).

The ratchet was real, and had four parts. Every one is now addressed:

| The mechanism | What `main` did |
| --- | --- |
| a single miss demoted — any miss set confidence to exactly `-15.0`, and the gate was `<= -15.0` | threshold moved to `DEMOTION_CONFIDENCE_THRESHOLD = -25`, which one miss no longer reaches |
| a miss sitting in the 5-attempt window demoted again on each following attempt | demotion is evaluated only on the wrong answer itself (`if (!attempt.correct)`) |
| promotion needed 5 first-attempt wins at ≥90% accuracy, ~20 attempts away | `PROMOTION_WIN_TARGET` 5→3, `PROMOTION_ACCURACY_TARGET` 0.9→0.8 |
| demotion left confidence at the floor, so the next miss demoted instantly again | `POST_DEMOTION_CONFIDENCE_FLOOR = -10` lifts it clear on demotion |

Two further causes I had not identified were also fixed there: the ELO K-factor
was `4/3/2`, so the rating barely moved and difficulty could not track a child at
all — now `16/12/8`; and promotion could park a learner on a curriculum step with
zero authored problems, which a pool-backed `stepContentProvider` now skips.
The lane mix was rebalanced too (`comfort` 0.4, `review` 0.2, `at_level` 0.3, and
the `stretch` lane restored at 0.1 behind `canUseStretchLane`), so at-level
exposure is 30% rather than the 25% this document reasoned from.

**What this branch contributes** is not a fix but a guard. The demotion mechanism
is now pinned in three places so it cannot regress quietly:
`godot/tests/test_demotion_lane.gd` asserts the behaviour, and
`tools/validate_docs.js` asserts `if (!attempt.correct)`,
`DEMOTION_CONFIDENCE_THRESHOLD = -25` and `POST_DEMOTION_CONFIDENCE_FLOOR = -10`
directly against the kernel source. Before this, nothing failed if someone moved
that threshold back.

**The lesson worth keeping** is the one about process, not pedagogy: this analysis
was careful, quantified, simulated — and aimed at a version of the file that was
already superseded. Reasoning backward from failure does not help if you reason
from a stale tree. Check what trunk did before pre-morteming your own branch.

## Also shipped

A portrait-orientation hint. The game is landscape-only, and a child holding the
iPad upright got a letterboxed strip with no explanation — and cannot read an error
message anyway. Ten lines of CSS plus an overlay injected at build time.

## Deliberately not done, and why

- **Do not make the PIN real authentication.** The threat model is a sibling
  picking the wrong profile in a family home. The honest fix is the documentation.
- **Do not replace the in-memory rate limiter.** Correct at one instance, and one
  instance is correct at this traffic. Fix it the day a second is added.
- **Do not build content moderation.** There is no user-generated content; the
  40-character display-name cap is the whole control. A filter on a name only the
  child's own family sees is theatre.
- **Do not fix the offline-conflict cosmetic loss.** It needs two devices, both
  offline, both playing. It is instrumented; let the instrumentation earn the fix.
- **Do not build on-call, alert escalation, or a status page.** The correct
  incident response is "redeploy the previous Railway deployment", and it exists.
- **Do not pre-optimise the first launch further.** Immutable content-addressed
  caching already makes launch two the ~5 KB case.
- **Do not validate difficulty against a cohort before shipping.** That needs the
  users who do not exist yet. Ship the hedge and the instrumentation, then learn.

## What to watch in the first two weeks

| Signal | Where | What it means |
| --- | --- | --- |
| `boot_start` vs `boot_ready` per release | `error_groups` / `error_events` | a gap is launches that never became a playable game |
| `engine_boot` fatals | `error_groups` | the failure a child actually sees |
| `hadExistingSave` false on repeat launches | `boot_ready` context | storage eviction wiping progress |
| `currentStep` distribution vs attempt count | needs cloud save | whether main’s ladder fixes actually let other children climb |
| `sync_conflicts` rows | Postgres | whether the accepted merge cost ever bites |

The last two require cloud save to work, which requires the mail provider. That
dependency is the strongest argument for configuring it before the URL goes out.
