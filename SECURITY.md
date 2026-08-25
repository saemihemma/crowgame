# Security

Status: Supportive
Authority: Reporting process and the current security posture.
Last verified against code: 2026-08-25

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
  is enrolled. It is IP rate-limited (20/min), body-capped, reflects nothing back,
  and stores no text a *player* typed — no child id, no display name, no answer.

  It does store caller-supplied text, and this page previously said it stored
  none, which is the claim a researcher would have tested first. `message` (≤2000
  chars), `stack` (≤8000), `source` (≤500) and up to 20 sanitized `context` keys
  (≤200 each) are all attacker-controlled, and one of them persists: `message`
  plus a `{context, stack}` sample is written into `error_groups`, which has no
  retention job and no cap on distinct fingerprints. The fingerprint is a hash of
  the normalized message, so varying the message mints a new permanent row —
  roughly a few MB/minute of durable growth from a single address at the shipped
  limits, where `error_events` is bounded by dropping day partitions at 30 days.
  That asymmetry is a real finding rather than a design choice, and it is open in
  `roadmap.md`. Reports about it are welcome; it is named here so nobody has to
  discover it to tell us.
- **Device-scoped auth.** The credential is an opaque random token in an
  `HttpOnly; Secure; SameSite=Lax` cookie, stored server-side as SHA-256 only. It
  resolves to a device, which belongs to a family.
- **Family isolation is enforced in Postgres**, via row-level security, in
  addition to explicit predicates in every query. Every request path — all four
  database entry points, including the anonymous error ingest and the health
  probe — drops to the non-superuser `crow_app` role first, precisely because a
  superuser bypasses those policies outright and holds every privilege. The
  role holds DELETE on `attempts` **not at all**, so the record of what a child
  answered cannot be rewritten by a query bug. `child_save_history` is different
  and the distinction is deliberate: the role DOES hold DELETE there, because the
  application prunes history to the last `CROW_SAVE_HISTORY_DEPTH` versions, so
  what bounds that table is the prune's `server_version <= $2 - $3` window and not
  a privilege. An earlier version of this page claimed both tables withheld
  DELETE. Only `attempts` does.

  Asserted by `server/test/role-isolation.test.ts` against a real cluster: what
  `current_user` is on each path, that a predicate-free `select` inside a family
  transaction returns one family's rows while the same query on the pool returns
  every family's, that the role is refused a `delete from attempts`, and — the
  assertion whose absence let the wrong claim above stand for a round — that it is
  *allowed* one on `child_save_history`, with the prune named as the reason. Two
  paths did NOT drop the role until 2026-08-25 — `DELETE /api/v1/family` and
  `POST /api/v1/errors` — while comments in the code claimed they did; the static
  half of that test file now fails the build if any route reaches for the
  superuser pool again.
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

## Data handling

See [PRIVACY.md](./PRIVACY.md) for what is stored and for how long. In short:
error events are deleted after 30 days by dropping day partitions
(`CROW_ERROR_RETAIN_DAYS`); the last 20 save versions per child are kept so a bad
sync is recoverable (`CROW_SAVE_HISTORY_DEPTH`); and a family can
export everything or delete everything at any time, with the delete cascading
immediately.
