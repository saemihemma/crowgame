# Serve the prebuilt Godot HTML5 export (output/web) as static files.
#
# The export is built in CI (see .github/workflows/ci.yml) and committed,
# so this image is just Caddy + files: it deploys in seconds and needs no Godot
# toolchain or export templates on the deploy path.
#
# Per-environment behaviour is set by env vars, NOT by editing this file:
#   CROW_ASSET_CACHE  staging: no-store   prod: no-cache
#   CROW_ROBOTS       staging: "User-agent: *\nDisallow: /"
# See deploy/RAILWAY.md for the one-time service setup.
FROM caddy:2-alpine

COPY output/web /srv
COPY deploy/web/Caddyfile /etc/caddy/Caddyfile

# Precompress the payload at image-build time so Caddy serves a static .gz
# (file_server precompressed) instead of gzipping a 34 MB wasm on every request.
# Done here rather than committed: the repo stays lean, the image stays fast.
RUN set -eux; \
    for f in /srv/index.wasm /srv/index.pck /srv/index.js /srv/index.audio.worklet.js; do \
      [ -f "$f" ] && gzip -9 -k "$f"; \
    done; \
    ls -la /srv

# Fail the build rather than deploy a broken config -- which it now does. It
# read `... | tail -2 || true`, and BOTH halves of that made it a no-op: a
# pipeline exits with tail's status, and `|| true` swallowed whatever survived.
# So the one check standing between a typo in the Caddyfile and every player
# getting a 502 could not fail, in a file whose own comment says it must.
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

EXPOSE 8080
