# Serve the prebuilt Godot HTML5 export (output/web) as static files on Railway.
# Tiny image: just Caddy + the committed build. Deploys in seconds, so the
# iteration loop is: rebuild output/web -> push -> Railway redeploys -> refresh.
#
# Railway service setup (one time):
#   New Project -> Deploy from GitHub repo -> crowgame
#   Service Settings -> Build:
#     Root Directory   = (repo root, leave blank)
#     Dockerfile Path  = deploy/web/Dockerfile
#   Networking -> Generate Domain  (gives the public https URL)
FROM caddy:2-alpine
COPY output/web /srv
COPY deploy/web/Caddyfile /etc/caddy/Caddyfile
