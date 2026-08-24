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

## Story 3 — "The game decided she's bad at maths" · measured, not patched

A seven-year-old plays a fortnight and every problem stays trivially easy. She is
bored; the parent's read is "it's a baby game, it doesn't teach anything". Or the
mirror: a struggling five-year-old is pinned at step 0 forever and the parent
concludes it doesn't adapt.

This was the "learner model tuned for one child" risk, and the mechanism turned out
to be specific:

- **Promotion** needs 5 first-attempt wins at the current step **and** ≥90%
  first-attempt accuracy over the last 10 attempts in that domain.
- **Demotion** needs only **2 wrong in the last 5** — counted across *all* lanes.
- Only **25%** of served problems are at the current step (50% comfort, 25%
  review), so 5 at-level wins take ~20 attempts while the 5-attempt demotion
  window slides across every one of them.
- **The review queue closes the loop.** A miss schedules a review item due in 2-4
  attempts; the demotion window is 5. The system re-serves a just-missed skill
  *inside the window where a second miss demotes*, resetting `winsAtCurrentStep`
  to 0. A downward ratchet assembled from two individually reasonable constants
  that nobody had compared to each other.

At 90% first-attempt accuracy a child climbs, barely. At 80%, demotion
opportunities fire roughly every 4 attempts against a promotion needing ~20 — so
they never leave step 0-1. The owner's son is almost certainly a 90%+ child on this
content, which is exactly why it was invisible.

**Tried, measured, and reverted:** filtering demotion's wrong-count arm to
`at_level` misses only. It is the obvious fix — a miss on a deliberately easier
comfort problem, or on a review item, is not evidence that the current step is too
hard — and it was written in both the reference kernel and the Godot
implementation. Then the runtime selector simulation was run against it:

| | before | after the filter |
| --- | --- | --- |
| steady learner's addition step | 1 | 2 |
| `steadyFirstSubtractionUnlockAttempt` | 38 | **-1 (never)** |

Subtraction unlocks on ≥90% first-attempt accuracy over 20 attempts, and a child
held one step deeper answers less accurately — so buying a step of depth in
addition cost the entire second domain. Trading a whole domain for one step is a
pedagogy decision, not a cleanup, so the code was reverted to counting every lane
and the reasoning left in a comment at the site in both implementations.

**Also found while testing, and also left alone:** the wrong-count arm is not the
binding constraint either way. `_apply_confidence_update` sets `delta = -15.0` for
*any* miss, a fresh offset of 0 becomes exactly `-15.0`, and the demotion condition
includes `confidence_offset <= -15.0`. **So a single wrong answer on any lane
demotes the step immediately**, and trigger 1's threshold of 2 is only reachable
once wins have lifted confidence back above the line. That is consistent with
`PROJECT.md` ("mistakes should lower difficulty faster than success raises it") and
is kind in the short term, but combined with the promotion gate it can demote a
child faster than they can climb.

`godot/tests/test_demotion_lane.gd` pins all of this — including the single-miss
demotion — so whichever way the decision goes, it goes deliberately. The
one-character version, if wanted, is `confidence_offset < -15.0`, requiring two
misses rather than one; it needs the same simulation run against it first.

**The decision is the owner's**, and it is the one open product question left in
this document.

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
| `currentStep` distribution vs attempt count | needs cloud save | whether the ratchet is real for other children |
| `sync_conflicts` rows | Postgres | whether the accepted merge cost ever bites |

The last two require cloud save to work, which requires the mail provider. That
dependency is the strongest argument for configuring it before the URL goes out.
