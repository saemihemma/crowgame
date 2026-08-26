# Crow API — frozen wire contract

Status: Current
Authority: Canonical contract between the Godot client and the Crow API. A change
here is a change to every installed client. Implementation lives in `server/**`.
Last verified against code: 2026-08-23

## What this is

The parts of the client/server boundary that are expensive or impossible to
change once players have the game. Everything in this document is deliberately
decided *before* the endpoints exist, because a web game updates its client on
the next page load but cannot update a contract that already shipped semantics.

What this is not:
- not the database schema (see `server/migrations/`)
- not the deployment runbook (see `deploy/RAILWAY.md`)
- not a description of endpoints that all exist yet — build order is at the end

## The five frozen decisions

### 1. The client finds the API at a relative path

The API base is the literal string `/api/v1`. Not a configurable URL.

`crow_learner_api_base` — today a client-writable key that any script on the
origin can set, with an input field for it in the old admin page — is demoted to
a debug-only override, readable only under `OS.is_debug_build()`. It is not a
configuration input in a shipped build.

This is forced by how deploys work. Promotion to prod pushes the *byte-identical*
`output/web` that staging served (`deploy/RAILWAY.md`), so the client cannot carry
a compile-time API base — staging and prod would hit the same API. A relative
path plus a per-environment `reverse_proxy /api/*` in Caddy is the only shape that
fits, and it also means same-origin: no CORS, and the auth cookie is first-party.

### 2. The authorization subject is the device, scoped to a family. Never the child.

The old shape — `{api_base}/learner/{childId}/attempt` with no credential — is
void. `childId` was never usable as an authorization subject, and it is worse than
that: `ProfileManager._generate_id()` mints `"child-<ms>-<rand>"` per device, so
the same child on an iPad and a laptop already has two different `childId`s and
two different `familyId`s. It is not identity; it is a device-local handle.

The credential is an opaque 256-bit random token in a cookie:

```
Set-Cookie: crow_device=<token>; HttpOnly; Secure; SameSite=Lax;
            Path=/api; Max-Age=34560000
```

Stored server-side as SHA-256 only. Two reasons this beats a token in
`Persistence`:

- The Godot web export has no secure storage. Anything in `Persistence` reaches
  IndexedDB, readable by any script on the origin. `HttpOnly` is not.
- **Safari evicts script-writable storage, IndexedDB included, after about seven
  days without interaction.** A cookie set by the server on a top-level
  navigation survives where IndexedDB does not. This is also the sharpest
  argument that cloud save is necessary rather than nice: the current local-only
  save is already exposed to this.

Because of that second point the cookie **must** be set on the magic-link
redirect — a top-level navigation — and not on an XHR response.

Every read and write resolves `token → device → family` and is then scoped
`WHERE child.id = $1 AND child.family_id = $token.family_id`. `childId` may appear
in a path as an *object reference*; it never grants anything. This is enforced
twice: once in a single family-scoped data-access module, and once in Postgres
row-level security with `SET LOCAL app.family_id` per transaction. RLS is close to
free at schema-creation time and painful to retrofit across every query later;
for a store of children's data it goes in now.

### 3. The PIN never leaves the device

`ProfileManager._hash_pin()` computes `btoa(pin + ':' + username)`, which is
reversible by inspection. The 4-digit PIN is a "which kid am I" selector on a
shared family device. It is not authentication, it never has been, and no server
verifies it.

So: the PIN is never transmitted, never stored server-side, and there is no
`pin_hash` column. (`docs/learner_backend_schema.sql` — an older draft — has
`child_profiles.pin_hash text not null`. That draft is superseded by this document
and must not be implemented as written; it would import a fake credential for a
minor into a database.)

The only PII collected anywhere is the parent's email address. Children carry a
display name and nothing else.

### 4. The sync unit is the save blob, arbitrated by `problemsAttempted`

One document per child. Whole-document, last-writer-wins, where "last" means the
device that has seen more of that child's answers.

The save blob is the right unit because it is the only object that contains what
a child experiences as progress — coins, stars, owls saved, levels, abilities —
*and* it already embeds `eloStats` and `learnerState` (`save_manager.gd`), and it
already has a version field with a tested migration seam.

Syncing the learner snapshot instead does not work, for a reason that is easy to
miss: `LearnerStateManager.replace_snapshot()` calls `_refresh_derived_state()`,
whose first line is `_snapshot["mastery"] = _elo().get_stats()`. Mastery is
recomputed from `ELOManager`, which hydrates from `save.eloStats` — not from the
snapshot. A perfect snapshot round-trip onto a fresh device still yields ELO 150.

Field-level merge is not a safer middle ground here, it is wrong:
`reviewItems[].dueAfterAttempt` is expressed relative to
`mastery.problemsAttempted`. Merging those two from different devices
desynchronises the review queue against its own clock. They travel together.

Arbitration order: higher `eloStats.problemsAttempted` wins; tie broken by higher
`save.timestamp`; tie broken by server receipt order. `problemsAttempted` is
already present, already monotonic, and only advances on real play — and it is
explainable to a parent in one sentence.

Known cost, accepted for v1: a device that plays offline while another device
plays more loses that session's cosmetic progress. Bounded to one session, and
every arbitration logs a conflict event so the decision can be revisited with
real numbers instead of speculation. The last 20 save versions per child are
retained server-side, so a bad merge is a support action rather than a loss.

### 5. Attempts are a batched, idempotent, append-only log

`POST /api/v1/attempts/sync` only. There is no single-attempt endpoint — at 2
problems per owl encounter that would be roughly one request per 20 seconds of
play, per child.

`attemptId` is client-generated (`"attempt-<ms>-<rand>"` — note: **not** a UUID,
so the column is `text`) and is the idempotency key: the primary key is
`(child_id, attempt_id)` and inserts are `ON CONFLICT DO NOTHING`. The response
returns `appliedAttemptIds`, and the client clears only those from its pending
queue. This is already how `learner_sync_service.gd` behaves, and it is the most
valuable property of the existing client: it sends everything, and it accepts
whatever state the server returns. That combination means the merge rule can be
improved server-side later with no client change.

`answeredAt` is a child's iPad clock and is not trusted. The server stores both
the claimed `answered_at` and its own `received_at`, orders the log by server
sequence, and rejects timestamps more than a day in the future.

The attempt log is not the transport for state — it cannot be, because
`LearnerStateManager._get_review_gap()` uses `randi()` and review ids embed
randomness, so a server cannot reproduce a client snapshot by replaying attempts.
It is the durable record: the answer to "did my child's work get lost", and the
substrate for any future server-authoritative reducer.

## Endpoints

`POST /api/v1/errors` is anonymous. The admin surface uses a single bearer
token (`CROW_ADMIN_TOKEN`; unset = every admin route answers 404) sent only in
the Authorization header. Everything else requires the device cookie.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/health` | none | liveness + migration state |
| `GET` | `/api/v1/auth/session` | none | is this device enrolled? |
| `POST` | `/api/v1/auth/signout` | device | revoke this device's tokens |
| `POST` | `/api/v1/errors` | **none** | client error ingestion |
| `POST` | `/api/v1/auth/request-link` | none | email a magic link |
| `GET` | `/api/v1/auth/consume` | link token | top-level nav; sets device cookie |
| `POST` | `/api/v1/auth/pair` | device | issue a pairing code for a 2nd device |
| `POST` | `/api/v1/auth/redeem` | none | redeem a pairing code, sets cookie |
| `GET` | `/api/v1/family/children` | device | list children for child-picking |
| `POST` | `/api/v1/family/children` | device | create a child (optional `birthYear`), returns server id |
| `PUT` | `/api/v1/family/children/{id}/birth-year` | device | backfill/correct a child's birth year (year only, for grade mapping) |
| `GET` | `/api/v1/children/{id}/save` | device | fetch authoritative save |
| `PUT` | `/api/v1/children/{id}/save` | device | upsert save, compare-and-set |
| `POST` | `/api/v1/attempts/sync` | device | batch attempts, returns applied ids |
| `POST` | `/api/v1/play/pings` | device | `{childId, count}` — N intervals of play, returns `acceptedPings` |
| `DELETE` | `/api/v1/family` | device | hard delete, cascade |
| `GET` | `/api/v1/family/export` | device | full data export |
| `GET` | `/api/v1/family/children/{id}/report` | device | parent report: per-domain, per-kind accuracy rollup + Icelandic grade verdicts when a birth year is set (docs/GRADE_EXPECTATIONS.md) |
| `GET` | `/api/v1/admin/overview` | admin bearer | owner KPIs: DAU, retention, sessions, attempts, errors |
| `GET` | `/api/v1/admin/errors` | admin bearer | deduplicated error groups, filter by status |
| `POST` | `/api/v1/admin/errors/{fp}/status` | admin bearer | triage: open/acknowledged/resolved/ignored |
| `GET` | `/admin` | none (shell) | the owner dashboard page; all data behind the bearer |

`DELETE /api/v1/family` and the export exist from the first release that stores
anything. They are cheap to build now and awkward to retrofit, and for
children's data a delete path is not optional.

### Server-issued ids live alongside the local ones

The server mints `remoteChildId` / `remoteFamilyId`; the client keeps its existing
local ids and stores the server's alongside them in the `crow_profiles` record.
No local storage key is renamed — `crow_save_<username>` and
`crow_learner_snapshot_<childId>` stay exactly as they are, so no installed data
is at risk.

The resulting invariant is clean: *local ids are device-scoped, server ids are
global, and the profile record is the mapping table.* This also makes
`_normalize_snapshot()` — which today looks like a bug, because it overwrites an
incoming snapshot's identity with the local profile's — correct by construction.
It is the local-identity boundary.

## Client-side budgets

These are part of the contract because they protect the server from the client.

| Concern | Rule | Why |
| --- | --- | --- |
| Save upload | debounce ~20 s, plus on `APPLICATION_PAUSED`, plus on scene change | `SaveManager._register_listeners()` wires `coins_changed → save()`, so every coin pickup is a local save. Uploading per save would melt the API. Do not rely on page-unload on the web. |
| Attempt batches | ≤100 attempts, ≤256 KB | bounded work per request |
| Play pings | `count` ≤ 60 per request | a ping is one integer; the cap bounds a long offline stretch |
| Save blob | ≤512 KB | it is a JSON document, not a filesystem |
| Error events | ≤10/session, ≤1 per fingerprint/session, ≤20 KB each, ring buffer that drops when full, honour `429` + `Retry-After` | errors are droppable; attempts are not |
| Writes | ≤6/min/device | server-enforced too |

The cloud flush is a *separate* debounce layered above `SaveManager`. Do not
change `SaveManager`'s local save cadence — local saving frequently is correct.

## Build order

Ranked by reversibility, which here is also the right shipping order.

- **Phase 0 — this document.** Everything above is baked into installed clients.
- **Phase 1 — error ingestion only.** No auth, tiny blast radius, independent of
  every other decision, and it is what tells us how the launch is actually going
  on real devices. Ships first.
- **Phase 2 — enrollment, magic link, device cookie, single-device cloud save**
  (save blob + attempt log, arbitration, version history).
- **Phase 3 — second-device pairing, conflict instrumentation, parent view.**

Deliberately deferred: a server-side reducer; mastery and skill projection
tables; attempt analytics; partitioning of `attempts`; per-PR preview
environments. And explicitly out of scope — anti-cheat: a child who fakes an
answer only mis-tunes their own difficulty.
