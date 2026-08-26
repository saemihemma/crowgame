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
| **whole payload** | **49.3 MB** | **~16.1 MB** |

Gzip is node's zlib at level 9; a server's own encoder will differ by a few
tenths. Per-file sizes are `ls -la output/web` when you need them.

**One field is deliberately outside the fingerprint:** `build_info.json` carries
a timestamp and the commit the build was made from, and it is excluded so a
rebuild does not stale the export for a reason that is not a source change. The
consequence is that its `commit` can name an earlier commit than the one whose
tree the bytes were built from, which matters because production error triage
keys on that field. Read it as "built from this source", not "shipped in this
commit".

So a first launch transfers about **16.1 MB**, and a returning player transfers
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
3. **Settings → Build:** Dockerfile Path = `deploy/api/Dockerfile`, Root
   Directory blank.

   > **Check the build log before moving on.** A root `railway.json` exists and
   > pins `deploy/web/Dockerfile`. If it wins, this service silently builds and
   > runs the *web* image — a Caddy serving static files, which passes a
   > superficial health check and serves no API at all. Confirm the log names
   > `deploy/api/Dockerfile`.
4. **Settings → Source:** branch `main` for staging, `release` for prod.
5. **Settings → Networking:** do **not** generate a public domain. Private only.
6. **Variables:**
   ```
   DATABASE_URL          = ${{ Postgres.DATABASE_URL }}
   CROW_ENV              = staging | production
   CROW_PUBLIC_BASE_URL  = https://<the web service's public domain>
   CROW_MAIL_DRIVER      = http
   CROW_MAIL_ENDPOINT    = <the mail processor's send URL>
   CROW_MAIL_API_KEY     = <its key>
   CROW_MAIL_FROM        = Hörmann <no-reply@your-domain>
   ```
   **The last five are not optional, and following this step without them ships a
   production where cloud save can never be turned on.** `CROW_MAIL_DRIVER`
   defaults to `log`, so `createMailer` returns a `LogMailer` with
   `delivers = false`; every enrollment then answers `sent: false,
   delivery: 'unavailable'` and writes the sign-in link to the server log instead
   of the parent's inbox. The code degrades honestly and says so in the response —
   this list was the gap, and it listed only the first two for as long as the
   runbook has existed.

   `CROW_PUBLIC_BASE_URL` is what the emailed link points at. Unset, the link is
   relative and unusable from an inbox.

   Note for PRIVACY.md: turning the mail driver on introduces the first third
   party that sees a parent's email address. That page says which one; keep the
   two in step when the processor changes.

   The service binds `::` by default. Do not override `HOST` to `0.0.0.0` —
   Railway's private network is IPv6, and that single change is the classic way
   to end up with a service that looks healthy and is unreachable.
7. **Settings → Deploy → Pre-deploy Command:**
   ```
   CROW_JOB=migrate node dist/migrate.js
   ```
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
```

## Cost notes

Railway bills egress. With a content-addressed payload served `immutable`, a
returning player transfers ~5 KB per launch instead of ~15.8 MB. A player
launching twice a day for a month is the difference between roughly 950 MB
(60 launches at the derived ~16.1 MB, done by hand — this figure is NOT gated,
unlike the table above) and
300 KB. Across a class or a family group that is the difference between egress
being a line item and being invisible.

The web service is small (Caddy + ~53 MB of static files) and stateless. The API
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
  correct for a single instance. Scaling out means moving it to Postgres or Redis
  first — noted rather than pre-built.
- **No preview environments per PR.** Staging is the shared pre-prod gate.
- **No COOP/COEP headers.** The export is single-threaded specifically so it can
  be served from any static host without cross-origin isolation. If a
  multi-threaded export is ever shipped, those headers go in the Caddyfile and the
  `no-store`/`no-cache` policy above still applies.
