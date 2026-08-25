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
  is enrolled. It is IP rate-limited, body-capped, stores no free text from the
  caller, and reflects nothing back.
- **Device-scoped auth.** The credential is an opaque random token in an
  `HttpOnly; Secure; SameSite=Lax` cookie, stored server-side as SHA-256 only. It
  resolves to a device, which belongs to a family.
- **Family isolation is enforced in Postgres**, via row-level security, in
  addition to explicit predicates in every query. The API runs as a
  non-superuser role precisely because a superuser bypasses those policies.
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
