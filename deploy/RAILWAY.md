# Railway deployment — staging and prod

Status: Current
Authority: Canonical deployment runbook. The live truth is the Railway dashboard
plus `deploy/web/Dockerfile` and `deploy/web/Caddyfile`.
Last verified against code: 2026-08-23

## What this is

The operational setup for serving Crow to real players: two Railway services off
one repo, a promotion path between them, and a rollback that does not require a
rebuild.

What this is not:
- not a description of the game (see `godot/README.md`)
- not a CI reference (see `.github/workflows/`)
- not a claim that a backend exists — there is no server-side component yet

## Topology

One repo, two Railway services, in **one** Railway project:

| Service | Deploys from | Purpose | `CROW_ASSET_CACHE` | Indexed by search engines |
| --- | --- | --- | --- | --- |
| `crow-staging` | branch `main` | every merge lands here first | `no-store` | no |
| `crow-prod` | branch `release` | what players get | `no-cache` | yes |

Both services build the same `deploy/web/Dockerfile`, which is Caddy plus the
committed `output/web` export. No Godot toolchain runs on the deploy path, so a
deploy is a seconds-long file copy, not a game build.

The two services differ **only** by environment variables. Do not fork the
Dockerfile or the Caddyfile per environment.

### Why the cache values differ

`output/web` filenames are fixed (`index.wasm`, `index.pck`) — Godot does not
content-hash them. That constrains the cache policy:

- **staging `no-store`** — nothing is cached, so a phone refresh always shows the
  newest build. This is the fast-iteration behaviour and it is worth the bytes on
  a device you are actively testing on.
- **prod `no-cache`** — the browser stores the payload and revalidates it with an
  ETag on each launch. `no-cache` does *not* mean "do not cache"; it means "cache,
  but check first". A repeat launch costs two small conditional requests and two
  `304 Not Modified` responses instead of re-downloading the build.

Measured payload, as of this writing:

| File | Raw | gzip |
| --- | --- | --- |
| `index.wasm` | 33.7 MB | 7.6 MB |
| `index.pck` | 18.7 MB | 14.9 MB |
| `index.js` + worklet | 0.3 MB | 0.1 MB |
| **total** | **52.7 MB** | **~22.6 MB** |

So prod on `no-store` would mean ~22.6 MB per launch per player. That is the
single largest avoidable cost in the whole deployment, and on an iPad over
cellular it is also the worst part of the experience.

**Upgrade path (not done yet):** content-hash the payload filenames at build time
and rewrite the `GODOT_CONFIG` block in `index.html` to match. Then prod can serve
`Cache-Control: public, max-age=31536000, immutable` and a repeat launch costs
zero requests for the payload. That is a build-script change, tracked separately;
`no-cache` is the correct policy until it lands.

## One-time setup

Do this once, in the Railway dashboard. Nothing here is in the repo because
Railway service wiring is not config-as-code in this project.

### 1. Create the project and the staging service

1. **New Project → Deploy from GitHub repo →** select the `crowgame` repo.
2. Rename the created service to **`crow-staging`**.
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
2. Rename it to **`crow-prod`**.
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

### 3. Create the release branch

The `release` branch must exist before `crow-prod` can deploy:

```bash
git fetch origin main
git push origin origin/main:refs/heads/release
```

## Deploying

### Normal flow

```
push to main ──▶ CI: godot tests + web export ──▶ crow-staging deploys
                                                        │
                                          verify on the actual iPad
                                                        │
                                                        ▼
                                          promote: main ──▶ release
                                                        │
                                                        ▼
                                                  crow-prod deploys
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

### Rollback

Fastest, and the one to reach for during an incident — no git, no rebuild:

> Railway → `crow-prod` → **Deployments** → pick the last good deployment →
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

# 2. Is the cache policy the one this environment should have?
curl -sI https://<domain>/index.pck | grep -i cache-control
#   staging -> no-store
#   prod    -> no-cache

# 3. Does a repeat launch actually revalidate instead of re-downloading? (prod)
curl -sI https://<domain>/index.pck | grep -i etag
curl -sI -H 'If-None-Match: "<etag from above>"' https://<domain>/index.pck | head -1
#   expect: HTTP/2 304
```

## Cost notes

Railway bills egress. With prod on `no-cache`, a returning player transfers
roughly a few hundred bytes per launch instead of ~22.6 MB. A single player
launching the game twice a day for a month is the difference between ~1.4 GB and
a rounding error. This is the reason the prod value is not `no-store`.

The image itself is small (Caddy + ~53 MB of static files) and the service is
stateless — there is no database, no volume, and no persistence to provision.
All player data lives in the browser on the player's own device.

## What is deliberately not set up

- **No backend service.** Learner data is local to the device. If a learner API is
  added later it is a third service with its own environment variables, and the
  client contract needs an auth model first.
- **No volumes.** Nothing server-side is persisted, by design.
- **No preview environments per PR.** Staging is the shared pre-prod gate.
- **No COOP/COEP headers.** The export is single-threaded specifically so it can
  be served from any static host without cross-origin isolation. If a
  multi-threaded export is ever shipped, those headers go in the Caddyfile and the
  `no-store`/`no-cache` policy above still applies.
