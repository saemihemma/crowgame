# Security

Status: Supportive
Authority: Reporting process and the current security posture.

Hörmann stores learning data about young children. Please treat anything in that
area as worth reporting even if you are unsure it is exploitable.

## Reporting

Open a **private** GitHub security advisory on this repository (Security →
Report a vulnerability). Please do not open a public issue for anything that
exposes or could expose family data.

Include what you did, what happened, and what you expected. A proof of concept
helps but is not required. Please do not test against other people's families — if
you need an account, enroll your own.

## What is in scope, and what already holds

The attack surface is small on purpose:

- **One anonymous write endpoint**, `POST /api/v1/errors`. It exists because the
  errors most worth having — the game failing to load — happen before any device
  is enrolled. It is IP rate-limited, body-capped, reflects nothing back, and
  stores no text a *player* typed: no child id, no display name, no answer. The
  live caps are in `server/src/config.ts`.

  **"IP rate-limited" was not true in production until 2026-08.** Not because the
  limit was missing — it was there, and correct — but because the Caddy hop
  overwrote `X-Forwarded-For` with Railway's proxy address, so every caller on
  earth shared one bucket. A limiter with one bucket is not a weaker limiter; it
  fails in both directions at once, throttling players who did nothing and
  isolating no attacker from anyone. Every route now inherits a ceiling as well
  (`CROW_GLOBAL_RATE_PER_MIN`), the client address is decided in exactly one
  place (`server/src/lib/clientIp.ts`), and `server/test/ratelimit.test.ts`
  asserts both — including that nothing else reads `request.ip` directly, which is
  how a second, wrong answer to "who is this" would get in.

  **Known hole, and the sharpest one here.** It does store caller-supplied text —
  `message`, `stack`, `source` and sanitized `context` keys — and one of them
  persists: the message plus a context/stack sample is written into
  `error_groups`, which has no retention job and no cap on distinct fingerprints.
  The fingerprint is a hash of the normalized message, so varying the message
  mints a new permanent row, indefinitely, from an unauthenticated caller. That is
  asymmetric with `error_events`, which is bounded by dropping day partitions. It
  is open in `roadmap.md` and named here so nobody has to discover it to tell us.
- **Device-scoped auth.** The credential is an opaque random token in an
  `HttpOnly; Secure; SameSite=Lax` cookie, stored server-side as SHA-256 only. It
  resolves to a device, which belongs to a family.
- **Family isolation is enforced in Postgres**, via row-level security, on every
  child-data table — `children`, `child_saves`, `child_save_history`, `attempts`,
  `sync_conflicts`, `child_aliases`, `play_pings` — with both `ENABLE` and
  `FORCE`, in addition to explicit predicates in every query. The set is not a
  list anyone maintains: it is derived by walking foreign keys to `families`, so a
  new table joins it the moment it is migrated, and
  `server/test/role-isolation.test.ts` fails until it actually isolates.

  **The auth tables are deliberately outside that.** `parents`, `devices`,
  `device_tokens` and `login_codes` carry no policy, because resolving a token to
  a family has to happen before a family is known — the policy would need the
  answer the lookup is producing. They go through `withAuthTables`, which drops
  the role but sets no `app.family_id`, so what scopes them is the query's own
  predicate. That is a weaker guarantee than the one above, and it covers the
  grown-up email, which is the only PII in the system. Worth aiming at.

  **Every request path drops to the non-superuser `crow_app` role first** — all
  four database entry points, the anonymous error ingest and the health probe
  included — because a superuser bypasses RLS outright and holds every privilege.
  That role has no DELETE on `attempts`, so the record of what a child answered
  cannot be rewritten by a query bug. It *does* have DELETE on
  `child_save_history`, deliberately: the application prunes history to
  `CROW_SAVE_HISTORY_DEPTH` versions, so what bounds that table is the prune's own
  window and not a privilege.

  All of it is asserted against a real cluster in
  `server/test/role-isolation.test.ts`: `current_user` on each path; that a
  predicate-free `select` inside a family transaction returns one family's rows
  while the same query on the pool returns every family's; the DELETE asymmetry in
  both directions; and the protected set itself, derived by walking foreign keys
  to `families` rather than listed, so a new family-scoped table with no policy
  fails the build. A static half needs no database and fails if any route reaches
  for the superuser pool.
- **Single-use, short-lived** sign-in links and pairing codes, enforced in SQL
  rather than application logic so two simultaneous uses cannot both succeed.
- **No PII beyond a parent email.** Children carry a display name only.

Particularly welcome: anything that lets one family read or write another's data,
anything that turns the error endpoint into a general-purpose write sink, and
anything that recovers a device token from stored data.

## Known, accepted, and not a vulnerability

- **The 4-digit child PIN is not authentication.** It is a "which kid am I"
  selector on a shared family device. It is never transmitted, no server verifies
  it, and `_hash_pin()` is reversible base64 despite the name. Reports that the
  PIN can be bypassed on a device someone is already holding are working as
  intended. Reports that the PIN reaches the server would be a real bug.
- **Anyone holding an enrolled device can act as that family.** That is what
  enrolling a device means, and it matches how families actually share tablets.
- **A child can answer wrongly on purpose.** There is no anti-cheat and none is
  planned: the only consequence is their own difficulty being mis-tuned.
- **The parent report is not behind a gate.** It is a read-only view of the
  child's own progress on their own device.
- **Prose claims about behaviour are not gated, and this class of defect
  recurs.** `tools/validate_docs.js` checks only what can be derived from the
  tree — counts, payload figures, endpoint tables, freshness stamps — by
  deliberate design stated in its own header. A sentence of the form "the game
  never does X" is outside it, and no reasonable validator brings it inside.

  Review has repeatedly found such sentences false — five in a row, in a different
  file each time, every one found by a person reading a document against the code
  and none by a gate. So **treat every absolute in these documents as unverified,
  and treat a report that one is false as a valid finding rather than a wording
  complaint.** The sentence a parent relies on is part of the product.

  What IS mechanically enforced, so you can tell the two apart: the role each
  database path runs as; the RLS-protected set, derived from foreign keys rather
  than listed; per-table behavioural isolation with a guard against passing on an
  empty fixture; the export's response contents; the app role's privileges per
  table; and the absence of player-identifying keys in a stored error report,
  asserted through a real browser.

## Data handling

See [PRIVACY.md](./PRIVACY.md) for what is stored and for how long. In short:
error events are deleted after 30 days by dropping day partitions
(`CROW_ERROR_RETAIN_DAYS`); the last 20 save versions per child are kept so a bad
sync is recoverable (`CROW_SAVE_HISTORY_DEPTH`); and a family can
export everything or delete everything at any time, with the delete cascading
immediately.
