# Railway deployment — staging and prod

Status: Current
Authority: Canonical deployment runbook. The live truth is the Railway dashboard
plus `deploy/web/Dockerfile` and `deploy/web/Caddyfile`.

## What this is

The operational setup for serving Crow to real players: two Railway services off
one repo, a promotion path between them, and a rollback that does not require a
rebuild.

What this is not:
- not a description of the game (see `ONBOARDING.md`)
- not a CI reference (see `.github/workflows/`)
- not the client/server contract (see `ARCHITECTURE.md` (the wire contract))

## Topology

One repo, two Railway services, in **one** Railway project:

| Service | Deploys from | Purpose | `CROW_ASSET_CACHE` | Indexed |
| --- | --- | --- | --- | --- |
| `crow-web-staging` | branch `main` | static game + `/api/*` proxy | `no-store` | no |
| `crow-api-staging` | branch `main` | API. **No public domain** | n/a | n/a |
| `crow-web-prod` | branch `release` | what players get | `no-cache` | yes |
| `crow-api-prod` | branch `release` | API. **No public domain** | n/a | n/a |

Plus one Postgres and one retention cron service per environment (see §2c).
Eight services, two environments, one project.

The API is deliberately **not** publicly routable: the web service reverse-proxies
`/api/*` to it over Railway's private network. That is what lets the client use the
relative base `/api/v1` instead of a configured URL — which in turn means no CORS,
a first-party auth cookie, and staging/prod separation by environment variable
rather than by anything compiled into the client. It has to work that way, because
promotion ships byte-identical files to both environments.

It also means the API never sees a player's address directly, and that has bitten
once already. Caddy is not the edge — Railway's proxy is — so `{remote_host}` at
the Caddy hop is Railway's proxy, the same handful of addresses for every player
alive. The Caddyfile used to set `X-Forwarded-For` to exactly that, which
collapsed every per-IP rate limit in the API into ONE bucket: one noisy client
spent the budget for everybody, and no attacker was ever isolated. Caddy now
forwards Railway's own `X-Envoy-External-Address` as `X-Crow-Client-Ip`, and
`server/src/lib/clientIp.ts` is the single place that decides what to believe.
Verify it after any change to the proxy hop — §Verify a deploy, step 4.

Both services build the same `deploy/web/Dockerfile`, which is Caddy plus the
committed `output/web` export. No Godot toolchain runs on the deploy path, so a
deploy is a seconds-long file copy, not a game build.

The two services differ **only** by environment variables. Do not fork the
Dockerfile or the Caddyfile per environment.

### The payload, and why a repeat launch is free

`build_web.sh` renames the payload to `index.<content-id>.{wasm,pck,js}` and
rewrites the engine config in `index.html` to match. The id is a hash of the wasm
and pck together, so the filename *is* the content.

That makes the cache policy simple and, more importantly, correct:

| Path | Policy | Why |
| --- | --- | --- |
| `index.html` | `no-store` | ~5 KB, and the only file that knows which payload belongs to this build |
| `index.<id>.*` | `public, max-age=31536000, immutable` | the name is the content, so it can never be stale |

Measured payload, **derived from `output/web` by `npm run validate:docs`** so it
cannot drift from the artifact. The per-file breakdown used to be here; nobody
made a decision from it. The decision — is a first launch acceptable on home wifi
— comes from the total.

| | Raw | gzip |
| --- | --- | --- |
| **whole payload** | **52.4 MB** | **~17.7 MB** |

Gzip is node's zlib at level 9; a server's own encoder will differ by a few
tenths. Per-file sizes are `ls -la output/web` when you need them.

**One field is deliberately outside the fingerprint:** `build_info.json` carries
a timestamp and the commit the build was made from, and it is excluded so a
rebuild does not stale the export for a reason that is not a source change. The
consequence is that its `commit` can name an earlier commit than the one whose
tree the bytes were built from, which matters because production error triage
keys on that field. Read it as "built from this source", not "shipped in this
commit".

So a first launch transfers about **17.7 MB**, and a returning player transfers
**nothing at all** for the payload — no bytes, no conditional request, no `304`.
Only the 5 KB shell is re-fetched.


`CROW_ASSET_CACHE` still exists for the handful of files that are *not*
content-addressed (icons), and so staging can force `no-store` while iterating.

## One-time setup

Do this once, in the Railway dashboard. Nothing here is in the repo because
Railway service wiring is not config-as-code in this project.

### 1. Create the project and the staging service

1. **New Project → Deploy from GitHub repo →** select the `crowgame` repo.
2. Rename the created service to **`crow-web-staging`**.
3. **Settings → Build:**
   - Root Directory: *(leave blank — repo root)*
   - Builder: `Dockerfile`
   - Dockerfile Path: `deploy/web/Dockerfile`
4. **Settings → Source:** Branch = `main`, auto-deploy **on**.
5. **Variables:** add
   ```
   CROW_ASSET_CACHE = no-store
   CROW_ROBOTS      = User-agent: *\nDisallow: /
   ```
6. **Settings → Networking → Generate Domain.** This is the staging URL. Keep it
   to yourself; `CROW_ROBOTS` keeps it out of search results but does not make it
   private.

### 2. Create the prod service

1. In the **same project**: **New → GitHub Repo →** the same `crowgame` repo.
2. Rename it to **`crow-web-prod`**.
3. **Settings → Build:** identical to staging (Dockerfile path
   `deploy/web/Dockerfile`, blank root directory).
4. **Settings → Source:** Branch = **`release`**, auto-deploy **on**.
5. **Variables:** add
   ```
   CROW_ASSET_CACHE = no-cache
   ```
   Leave `CROW_ROBOTS` unset — prod should be indexable.
6. **Networking → Generate Domain**, or attach a custom domain. This is the URL
   you give to players.

### 2b. Create the API services and databases

For each environment (`staging`, then `prod`):

1. **New → Database → PostgreSQL.** Railway sets `DATABASE_URL` for you.
2. **New → GitHub Repo →** the same repo. Name it `crow-api-<env>`.
3. **Delete `railway.json` from the repo root FIRST, and only then set**
   Settings → Build → Dockerfile Path = `deploy/api/Dockerfile`, Root Directory
   blank.

   > **THE STEP THAT GOES WRONG, and it cannot be done from this service alone.**
   > `railway.json` at the repo root pins `deploy/web/Dockerfile`. Railway
   > auto-detects it for any service whose Root Directory is blank — which is
   > every service here — and config-as-code beats the UI, so typing the API
   > Dockerfile into the box above changes nothing while that file exists. The
   > service builds the *web* image: Caddy serving static files, no Node in it.
   >
   > It does not look like a build failure, which is why it has caught somebody
   > already. The build SUCCEEDS in about ten seconds (a real API build takes a
   > minute or more), and the pre-deploy command then dies after two with
   > `node: not found` — there is no `node` in `caddy:2-alpine` and no `dist/`.
   >
   > The file is still there because the WEB service depends on it: deleting it
   > with nothing set in that service's UI leaves Railway guessing a builder for
   > the game everybody is playing. So the order is fixed, and it is three steps
   > across two services:
   >
   >   1. on the **web** service, set Dockerfile Path = `deploy/web/Dockerfile`
   >      in the UI, so it no longer needs the file;
   >   2. delete `railway.json` from the repo root and deploy that;
   >   3. set Dockerfile Path = `deploy/api/Dockerfile` here.
   >
   > Do not reach for Settings → Config-as-code to point this service at its own
   > file. Railway deprecated it on 2026-08-28: existing files work until
   > 2026-12-01, and a service that never used one cannot opt in — which also
   > means the root file has to go before that date regardless.
   >
   > Confirm the build log names `deploy/api/Dockerfile` before moving on.

4. **Settings → Source:** branch `main` for staging, `release` for prod.
5. **Settings → Networking:** do **not** generate a public domain. Private only.
6. **Variables.** Two are required and the game works completely without the
   rest:
   ```
   DATABASE_URL = ${{ Postgres.DATABASE_URL }}
   CROW_ENV     = staging | production
   ```
   That is the whole of what a child signing in needs. Since 2026-08 the game's
   login is a username and a PIN checked against this database
   (`POST /api/v1/auth/signup` and `/signin`, migration 007), so cloud save
   arrives with the database and there is nothing to switch on. It used to be an
   enrolment flow that emailed a magic link, and this list used to say the mail
   variables below were not optional. For the game, they no longer are needed at
   all.

   **Optional — only for the email magic link**, which the game itself no longer
   uses. It is still how a parent reaches the report on a device with no child
   profile, and how a second device is paired:
   ```
   CROW_PUBLIC_BASE_URL = https://<the web service's public domain>
   CROW_MAIL_DRIVER     = http
   CROW_MAIL_ENDPOINT   = <the mail processor's send URL>
   CROW_MAIL_API_KEY    = <its key>
   CROW_MAIL_FROM       = Hörmann <no-reply@your-domain>
   ```
   `CROW_MAIL_DRIVER` defaults to `log`, so `createMailer` returns a `LogMailer`
   with `delivers = false`: `/auth/request-link` then answers `sent: false,
   delivery: 'unavailable'` and writes the link to the server log rather than to
   an inbox. That is an honest degraded state, not an outage, and nothing a child
   touches goes through it. `CROW_PUBLIC_BASE_URL` is what the emailed link
   points at; unset, the link is relative and unusable from an inbox.

   Note for PRIVACY.md: turning the mail driver on introduces the first third
   party that sees a parent's email address. That page says which one; keep the
   two in step when the processor changes.

   The service binds `::` by default. Do not override `HOST` to `0.0.0.0` —
   Railway's private network is IPv6, and that single change is the classic way
   to end up with a service that looks healthy and is unreachable.
7. **Settings → Deploy → Pre-deploy Command:**
   ```
   node dist/migrate.js
   ```
   Exactly that, with nothing in front of it, and **on the API service only** —
   the web service is a Caddy image with no Node in it, so a migrate command
   there fails every deploy.

   The runbook used to prefix this with `CROW_JOB=migrate`, which was never doing
   anything: `CROW_JOB` selects the role inside the image's own `CMD`, and a
   pre-deploy command replaces `CMD` outright. Harmless as a shell assignment,
   and a bug the moment somebody trimmed the `=migrate` off it — leaving
   `migrate node dist/migrate.js`, a command named `migrate`, which does not
   exist.

   Migrations run here, never at app boot: a boot-time migration races every
   replica that starts at the same time.

8. On the matching **web** service, add:
   ```
   CROW_API_UPSTREAM = crow-api-<env>.railway.internal:8080
   ```
   Leave it unset and `/api/*` returns 503 while the game still runs local-only —
   which is the correct degraded behaviour, not an outage.

### 2c. Create the retention job

One more service per environment, same image, no domain:

- **Settings → Build:** Dockerfile Path = `deploy/api/Dockerfile`
- **Variables:** `DATABASE_URL` as above, plus `CROW_JOB=retention`
- **Settings → Cron Schedule:** `17 4 * * *` (daily, off the hour so it does not
  collide with everything else that runs at midnight)

It creates upcoming daily partitions and drops ones past retention. Both matter:
if partitions stop being created ahead of time, new error events fall into the
default partition instead, which is a safety net rather than a home.

`pg_cron` is not available on managed Railway Postgres by default, which is why
this is a cron service rather than a database job.

### 3. Create the release branch

The `release` branch must exist before `crow-web-prod` can deploy:

```bash
git fetch origin main
git push origin origin/main:refs/heads/release
```

### 2d. Set a healthcheck on every service that serves traffic

Railway does not require one, and without one it swaps a new deployment in as
soon as the container starts. That means a broken image replaces a working one
before anything has proven it can answer — the deploy goes green, the site is
down, and the only signal is a player telling you.

**Settings → Deploy → Healthcheck Path:**

| Service | Path | Why that path |
| --- | --- | --- |
| `crow-web-<env>` | `/healthz` | Caddy answers it itself. Not `/index.html` and not `/api/*`: this service is a file server, and a healthcheck that fails because the database is down would refuse to deploy a fix to a bug that has nothing to do with either |
| `crow-api-<env>` | `/api/v1/health` | Deliberately DOES touch the database and reports `migrationsApplied`, because an API that cannot reach Postgres is not healthy in any useful sense |

Leave the timeout at the default. The API's check is one `count(*)`; the web
service's is a static string.

### 2e. Turn on Postgres backups, then restore one

Do this before a single child has an account, not after.

Railway → the Postgres service → **Backups** → enable, and set the retention you
are willing to lose data past. Then **restore one into a throwaway service and
sign in against it.** The rollback section below explains why this is not
optional: a forward-only migration means some rollbacks are a restore, and an
untested restore is not a backup. For a database whose entire purpose is not
losing a child's progress, this is the one setup step with no acceptable
workaround.

## Deploying

### Normal flow

```
push to main ──▶ CI: godot tests + web export ──▶ crow-web-staging deploys
                                                        │
                                          verify on the actual iPad
                                                        │
                                                        ▼
                                          promote: main ──▶ release
                                                        │
                                                        ▼
                                              crow-web-prod deploys
```

### Promote staging to prod

Promotion is a fast-forward of `release` to the commit already verified on
staging. Nothing is rebuilt — prod ships the exact bytes staging served.

```bash
git fetch origin
git push origin origin/main:release          # fast-forward only; fails if diverged
```

If that push is rejected, `release` has commits `main` does not. Do not force it
without checking why.

### Rollback, and the rule a database forces

**A deploy containing a non-additive migration is not rollback-safe.** Redeploying
a previous deployment rolls back *code*; it cannot un-migrate a *schema*. Roll back
onto a schema the old code does not understand and the failure is data corruption,
not a 500.

So migrations are forward-only and expand/contract:

1. Add the new column/table. Deploy. Old code ignores it.
2. Deploy code that writes both old and new.
3. Backfill.
4. Deploy code that reads only the new.
5. Only in a *later* deploy, drop the old.

Never combine step 5 with the deploy that stops using the thing being dropped. If
a release must include a destructive migration, say so in the release notes and
accept that its rollback is a restore, not a redeploy.

Which means: **Railway Postgres backups must be enabled, and one restore must have
been rehearsed.** For a database whose entire purpose is not losing a child's
progress, an untested backup is not a backup.

Fastest code rollback — no git, no rebuild:

> Railway → `crow-web-prod` → **Deployments** → pick the last good deployment →
> **Redeploy**.

To make the rollback stick across the next promotion, move the branch too:

```bash
git push origin +<last-good-sha>:release
```

This is the one place a force-push to `release` is correct. `release` is a
deployment pointer, not shared development history.

## Verify a deploy

```bash
# 1. Is the deployed build the commit you think it is?
curl -s https://<domain>/index.html | grep -o 'index\.pck'   # sanity: shell served
# The in-game build stamp (MainMenu, bottom corner) carries the commit.

# 2. Is the payload immutable, and the shell not?
curl -sI "https://<domain>/$(curl -s https://<domain>/build_id.txt | tr -d '\n' | sed 's/^/index./;s/$/.pck/')" | grep -i cache-control
#   expect: public, max-age=31536000, immutable
curl -sI https://<domain>/index.html | grep -i cache-control
#   expect: no-store
#   the hashed payload -> immutable in both environments (the name is the content)
#   index.html         -> no-store in both

# 3. Which build is live?
curl -s https://<domain>/build_id.txt
curl -s https://<domain>/build_info.json    # commit + build time

# 4. Is the API seeing real client addresses, or one proxy address for everybody?
curl -s https://<domain>/api/v1/health      # then read the API service's log
#   expect: remoteAddress differs between two callers on different networks.
#   If every request logs the same address, the proxy hop has stopped forwarding
#   X-Envoy-External-Address and every per-IP limit is now one shared bucket.
#   See the Topology section.
```

## Standing up to abuse

Two different problems get called "DDoS", and Railway helps with neither in the
same way.

### What the API is protected by, and it is not the platform

Every route inherits a per-IP ceiling — `CROW_GLOBAL_RATE_PER_MIN`, 600/min by
default — and the routes that need a real budget have a tighter one of their own:

| Surface | Budget | Keyed by | What it is for |
| --- | --- | --- | --- |
| everything, by default | 600/min | IP | nothing is unbounded. A ceiling, not a business rule |
| `POST /api/v1/errors` | 20/min | IP | the one anonymous write |
| `POST /api/v1/auth/signin` | 30/hour | IP | plus a per-ACCOUNT lock: 6 misses, 15 minutes. That one is the real fence — a 4-digit PIN is 13 bits, and an attacker has all the IPs they want |
| `POST /api/v1/auth/signup` | 20/hour | IP | account-creation spam |
| `/auth/request-link` | 10/hour | IP | mail sending |
| save writes | 6/min | device | a household shares an IP; a device is one child |

The default used to be *no* limit unless a route asked for one, and 12 of 20 did
not — including `/api/v1/health` and `/api/v1/auth/session`, which are
unauthenticated and hit an 8-connection pool on every call. `test/ratelimit.test.ts`
now asserts the ceiling by exhausting it.

Two things to know about the numbers. 600/min is 10 requests a second from one
address: an order of magnitude above a child at play, and roughly double a
classroom of thirty behind one school NAT. If you deploy somewhere many more
players share an address, raise it — the symptom that says you must is 429s from
one IP carrying many different device cookies. And the limiter is **in-memory**,
which is correct for one replica and is the thing that pins the API to one
replica; see the last section.

### What nothing here protects against, and what to do about it

A volumetric flood at the *web* service. Railway gives you no WAF, no per-IP
edge limit, and no CDN, and Caddy has no built-in rate limiter — so the whole
static payload is served, at full size, to anyone who asks, as many times as they
ask. Railway bills egress. The gzip payload is ~17.7 MB, so ten thousand cold
fetches is ~177 GB of billed transfer, arranged by anyone with a loop and no
skill. That is the realistic attack on this game: not downtime, a bill.

**Put Cloudflare (or any CDN) in front of the prod web service.** It is the
single highest-value item on this page and it is free at this scale:

1. Point the custom domain's DNS at Cloudflare, proxied (orange cloud), with
   Railway's domain as the origin.
2. Leave caching at default. The payload is content-addressed and served
   `immutable`, so the edge holds it and origin egress collapses to roughly one
   fetch per file per edge location — the same property that makes a returning
   player free makes a flood cheap.
3. Add a rate-limiting rule on `/api/*` — Cloudflare's free tier allows one — as
   the outer fence in front of the in-process limiter.
4. Leave `index.html` and `/api/*` uncached. Cloudflare respects the `no-store`
   the Caddyfile already sets, so this needs no configuration; it needs
   *checking*, once, per §Verify a deploy.

Do this for prod. Staging does not need it and is better without the extra hop
while iterating.

One thing a CDN does not fix, because it is not volumetric: `error_groups` grows
one permanent row per distinct error message from an unauthenticated caller, with
no retention job. SECURITY.md carries it as a known hole. It is a slow bill
rather than a fast one, and it is the next thing to bound.

## Cost notes

Railway bills egress. With a content-addressed payload served `immutable`, a
returning player transfers ~5 KB per launch instead of ~17.6 MB. A player
launching twice a day for a month is the difference between roughly 1.05 GB
(60 launches at the derived ~17.6 MB, done by hand — this figure is NOT gated,
unlike the table above) and
300 KB. Across a class or a family group that is the difference between egress
being a line item and being invisible.

The web service is small (Caddy + ~55 MB of static files) and stateless. The API
is IO-light: a couple of statements per request, a small connection pool.

Error-log storage is bounded by construction: raw events live 30 days in daily
partitions that get dropped, and per-fingerprint hourly caps mean a bug hitting a
thousand children costs a thousand counter bumps rather than a thousand rows. The
aggregates are kept forever and are tiny.

## What is deliberately not set up

- **No volumes.** Postgres is the only stateful thing; nothing is written to a
  service's local disk.
- **No third-party analytics, ads, or tracking.** The only thing sent from a
  client is a save, an attempt batch, or an error report.
- **No more than one API replica.** The rate limiter is in-memory, which is
  correct for a single instance and is the *only* reason the count is one: the
  service is otherwise stateless, and Postgres is nowhere near a limit. Two
  replicas without changing it would give each its own counters, so every budget
  on this page silently doubles.

  The unlock, when the API stops keeping up, in order: move the limiter to a
  shared store (Railway Redis is one service and `@fastify/rate-limit` takes a
  `redis` option, so this is configuration rather than design), then raise the
  replica count, then raise `CROW_DB_POOL_MAX` only if Postgres actually shows
  waiting. Do not reorder those. The API is IO-light — a couple of statements per
  request — so the first thing that will actually strain is Postgres write volume
  on `attempts`, not the Node process.
- **No preview environments per PR.** Staging is the shared pre-prod gate.
- **No COOP/COEP headers.** The export is single-threaded specifically so it can
  be served from any static host without cross-origin isolation. If a
  multi-threaded export is ever shipped, those headers go in the Caddyfile and the
  `no-store`/`no-cache` policy above still applies.
