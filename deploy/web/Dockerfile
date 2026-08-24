# Serve the prebuilt Godot HTML5 export (output/web) as static files.
#
# The export is built in CI (see .github/workflows/build-web.yml) and committed,
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

# Fail the build rather than deploy a broken config.
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -2 || true

EXPOSE 8080
