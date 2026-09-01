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
| **whole payload** | **51.7 MB** | **~17.7 MB** |

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


**This figure is about to move, and the direction is not obvious.** The audio
bank grew from 23 sounds to 52 (30 new effects, six proximity loops and five
ambience beds), which measured ~1.8 MB gzipped in a trial export — but that cost
is almost entirely **placeholder**: the generated bank is uncompressed 16-bit WAV
because `tools/gen_sfx.py` has no encoder. Real files arrive as MP3 and give most
of it back. The number above is the committed export's, and the committed export
is the live game, so it stays honest until `npm run web:build` replaces it — see
[brand/SOUND_DESIGN.md](../brand/SOUND_DESIGN.md) §9.

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
   Directory blank. The web service's own Build settings read
   `deploy/web/Dockerfile`. Those two fields are the ONLY place either image is
   named -- there is no config file in this repo any more, on purpose.

   > **THE HISTORY, because this cost a real evening.** A `railway.json` used to
   > sit at the repo root pinning `deploy/web/Dockerfile`. Railway auto-detects
   > that file for any service whose Root Directory is blank -- which is every
   > service here -- and config-as-code beat the UI, so typing the API Dockerfile
   > into the box above changed nothing. The API service built the *web* image:
   > Caddy serving static files, with no Node in it.
   >
   > It does not present as a build failure, which is why it is worth
   > recognising by its shape: the build SUCCEEDS in about ten seconds (a real
   > API build takes a minute or more), and the pre-deploy command then dies
   > after two with `node: not found`. There is no `node` in `caddy:2-alpine`
   > and no `dist/` either.
   >
   > Railway then deprecated the mechanism outright -- config-as-code on
   > 2026-08-28, replaced by Infrastructure as Code (`.railway/railway.ts`) --
   > with existing files working only until 2026-12-01 and no way for a new
   > service to opt in. So the file had to go regardless, and it is gone.
   >
   > If this repo ever wants its deployment described in version control again,
   > `.railway/railway.ts` is the supported way and it can define BOTH services
   > in one place, which is the thing `railway.json` structurally could not do.
   > Until somebody writes it, these two UI fields are the contract.

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
   which is the correct degraded behaviour, not an outage. The same variable also
   carries `/audio` (below), for the same reason and with the same fallback.

### 2d. Turn on the sound bench at /audio

The owner's sound-review page: every effect and every song in the game, played in
a browser at the volume and pitch the game actually uses. It is how a sound gets
iterated without a Godot install — see [brand/SOUND_DESIGN.md](../brand/SOUND_DESIGN.md).

**One variable, on the API service:**

```
CROW_AUDIO_PASSWORD = <anything you like>
```

Then open `https://<web domain>/audio` and type it. That is the whole setup.

Four things about it are deliberate:

- **Unset means 404, not open — on a deployed host.** `/audio` and all three
  endpoints behind it answer exactly like routes that do not exist, so the page
  is unprobeable until the owner switches it on. Same posture as `/admin`.

  The condition is `CROW_ENV`, not the password alone. Every Railway service sets
  it (`staging` or `production`, §2), so forgetting the password here fails
  closed. On a developer's machine `CROW_ENV` is unset, and there an empty
  password means the bench is **open** instead: `tools/audio_bench.ps1` starts it
  with no gate at all, because choosing between takes is a hundred reloads
  against a working copy and the thing being guarded is a folder of sound effects
  the developer just generated. See `config.audio.open`, and
  `server/test/audio_off.test.ts`, which exists to prove this exact line.
- **It is NOT the admin token.** `CROW_ADMIN_TOKEN` guards aggregated data about
  real children; this guards a page that plays sound effects. One secret for both
  would mean handing the analytics surface to anyone the owner wants to play a
  sound to.
- **The password is exchanged once for a signed, HttpOnly cookie**, and the login
  is rate-limited per IP (`CROW_AUDIO_ATTEMPTS_PER_MIN`, default 10). A cookie
  rather than a bearer token because `<audio src>` cannot carry a header.
- **It lives on the API, and Caddy routes `/audio` to it.** The web build packs
  every sample into `index.pck`, so a browser cannot address one to play it; the
  API image carries the sample tree (~3 MB) instead. With `CROW_API_UPSTREAM`
  unset, `/audio` returns 503 like `/api/*` and nothing a player touches changes.

**No ElevenLabs key goes anywhere near Railway.** Sound generation is an offline
authoring step (`npm run audio:gen`) that runs on the owner's machine and commits
its output; nothing at runtime calls ElevenLabs, so nothing at runtime holds a
credential for it. See §"Secrets, and where they are not" below.

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

## Secrets, and where they are not

Every credential this project uses, and the one rule that decides where it goes:
**a secret belongs to the process that makes the call, and nowhere else.**

| Secret | Lives on | Never |
| --- | --- | --- |
| `DATABASE_URL` | API + retention services | the web service, the client |
| `CROW_ADMIN_TOKEN` | API service | the web service, a URL, a log line |
| `CROW_AUDIO_PASSWORD` | API service | the web service, a URL |
| `CROW_MAIL_API_KEY` | API service | anywhere else |
| `ELEVENLABS_API_KEY` | **the owner's own machine only** | Railway, the repo, the game |

The last row is the one that is easy to get wrong, so it is worth stating in
full. The sound generator (`tools/gen_audio_elevenlabs.mjs`) is an offline
authoring tool in the same category as `npm run cms` and `npm run
math:materialize`: it runs by hand, writes files into `godot/assets/audio/`, and
those files are committed. **The game never calls ElevenLabs and the API never
calls ElevenLabs**, so neither of them should be able to.

```bash
export ELEVENLABS_API_KEY=...          # your shell profile, or a gitignored .env
npm run audio:gen -- --list            # what there is to make
npm run audio:gen -- --dry-run --all   # every prompt, spends nothing
```

There is one other place the key may legitimately live, and it is better than a
shell: an **API credential on a Claude Code cloud environment**. The key is stored
on the environment and Anthropic's agent proxy attaches the `xi-api-key` header
*after* the request leaves the sandbox, so it never reaches the agent, the
commands it runs, or the environment variables — and it grants network reach to
that host on its own, so no allowlist entry is needed either. Run the generator
with `--proxy-auth` there and it sends the request bare for the proxy to
authenticate. Everything above still holds: the key is never in the repo, never
in the game, and never on a Railway service.

Two consequences worth being blunt about:

- **Anything in `godot/**` is public.** The web build is ~52 MB of bytes served
  to anyone with the URL, and `index.pck` is a container, not a safe. A key put
  in a tuning file, a scene, or a `.gd` constant is a key you have published.
- **Anything in a Railway variable is readable by the service it is on.** That is
  fine for a database URL the API needs; it is not a reason to put a key there
  for a call nothing makes. A credential with no caller is pure liability — it
  can only ever leak, never be used.

If a key does leak: rotate it at the provider first (ElevenLabs keys are
account-wide and metered, so a leaked one is somebody else's bill), then remove
it. Removing it from a later commit does not remove it from the history.

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
