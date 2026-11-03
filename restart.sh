#!/usr/bin/env bash
# Home Dashboard — build and run a local production stack.
#
# Builds the web bundle and API, then runs all three tiers in the foreground:
#
#   nginx  :8080  serves apps/dashboard-web/dist, proxies /api and /voice
#   api    :8787  node dist/index.js
#   voice  :8788  uvicorn app.main:app
#
# Unlike the systemd install (infra/scripts/install-linux.sh) this needs no root:
# nginx runs as you, from a generated config under var/nginx, using the real
# infra/nginx/home-dashboard.conf as its source. Ctrl-C stops everything.
#
# Env: PORT (8080), API_PORT (8787), VOICE_PORT (8788), SKIP_BUILD=1
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PORT="${PORT:-8080}"
API_PORT="${API_PORT:-8787}"
VOICE_PORT="${VOICE_PORT:-8788}"

NGINX_DIR="$ROOT/var/nginx"
LOG_DIR="$ROOT/var/log"
WEB_DIST="$ROOT/apps/dashboard-web/dist"

log()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn:\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# --- preflight ------------------------------------------------------------
command -v pnpm  >/dev/null || err "pnpm not found — corepack enable, or npm i -g pnpm@10"
command -v nginx >/dev/null || err "nginx not found — sudo apt-get install nginx"
[ -x services/voice/.venv/bin/python ] || err \
  "voice venv missing — run: pnpm --filter @home-dashboard/voice setup"

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3<&-; return 0; }; return 1; }
for p in "$PORT" "$API_PORT" "$VOICE_PORT"; do
  port_busy "$p" && err "port $p is already in use (a dev server or systemd unit still running?)"
done

if [ ! -f .env ]; then
  warn "no .env — starting in demo mode (cp .env.example .env to add credentials)"
fi

mkdir -p "$LOG_DIR" "$NGINX_DIR/tmp" "$ROOT/var"

# --- build ----------------------------------------------------------------
if [ "${SKIP_BUILD:-}" = "1" ]; then
  log "SKIP_BUILD=1 — reusing the existing build"
  [ -f "$WEB_DIST/index.html" ] || err "no build to reuse at $WEB_DIST — unset SKIP_BUILD"
else
  log "Installing dependencies…"
  pnpm install --frozen-lockfile || pnpm install

  # contracts first: the API's compiled output imports its built JS, not src.
  log "Building contracts, web and api…"
  pnpm --filter @home-dashboard/contracts build
  pnpm --filter @home-dashboard/web build
  pnpm --filter @home-dashboard/api build
fi

[ -f "$WEB_DIST/index.html" ] || err "web build produced no index.html at $WEB_DIST"
[ -f "$ROOT/services/api/dist/index.js" ] || err "api build produced no dist/index.js"
[ -f "$ROOT/packages/contracts/dist/index.js" ] || err "contracts build produced no dist/index.js"

# --- nginx config ---------------------------------------------------------
# Derive from the production config so the two cannot drift: repoint the docroot,
# the listen port and the upstreams, then add the non-root runtime prelude.
log "Generating nginx config…"
{
  cat <<EOF
daemon off;
pid $NGINX_DIR/nginx.pid;
error_log $LOG_DIR/nginx-error.log warn;
events { worker_connections 256; }
http {
  access_log $LOG_DIR/nginx-access.log;
  client_body_temp_path $NGINX_DIR/tmp;
  proxy_temp_path $NGINX_DIR/tmp;
  fastcgi_temp_path $NGINX_DIR/tmp;
  uwsgi_temp_path $NGINX_DIR/tmp;
  scgi_temp_path $NGINX_DIR/tmp;
  types_hash_max_size 4096;
  include $(nginx -V 2>&1 | grep -o -- '--conf-path=[^ ]*' | cut -d= -f2 | xargs dirname)/mime.types;
  default_type application/octet-stream;
  sendfile on;
EOF
  sed \
    -e "s#/opt/home-dashboard#$ROOT#g" \
    -e "s#listen 8080;#listen $PORT;#" \
    -e "s#127.0.0.1:8787#127.0.0.1:$API_PORT#" \
    -e "s#127.0.0.1:8788#127.0.0.1:$VOICE_PORT#" \
    infra/nginx/home-dashboard.conf
  echo "}"
} > "$NGINX_DIR/nginx.conf"

nginx -t -c "$NGINX_DIR/nginx.conf" -p "$NGINX_DIR" \
  || err "generated nginx config is invalid — see $NGINX_DIR/nginx.conf"

# --- run ------------------------------------------------------------------
# Each service runs in its own process group so shutdown can take down the whole
# group -- nginx forks workers and uvicorn forks reloaders, and killing only the
# direct child would leave those holding the ports.
pgids=()
shutting_down=""
shutdown() {
  [ -n "$shutting_down" ] && return
  shutting_down=1
  printf '\n'; log "Shutting down…"
  for pgid in "${pgids[@]}"; do kill -TERM "-$pgid" 2>/dev/null || true; done
  for _ in $(seq 1 20); do
    still=""
    for pgid in "${pgids[@]}"; do kill -0 "-$pgid" 2>/dev/null && still=1; done
    [ -z "$still" ] && break
    sleep 0.25
  done
  for pgid in "${pgids[@]}"; do kill -KILL "-$pgid" 2>/dev/null || true; done
}
trap shutdown INT TERM EXIT

# Run a service in its own process group, prefixing its output.
spawn() {
  local tag="$1"; shift
  setsid "$@" > >(sed -u "s/^/$tag /") 2>&1 &
  local pid=$!
  pgids+=("$pid")   # setsid makes the child its own group leader: pgid == pid
}

log "Starting api on :$API_PORT…"
API_PORT="$API_PORT" spawn "[api]  " \
  node --enable-source-maps "$ROOT/services/api/dist/index.js"

log "Starting voice on :$VOICE_PORT…"
# API_URL: the voice service calls back into the API, and defaults to :8787 --
# pass the real port so a custom API_PORT does not break tool calls.
API_URL="http://127.0.0.1:$API_PORT" \
spawn "[voice]" "$ROOT/services/voice/.venv/bin/python" -m uvicorn app.main:app \
  --host 127.0.0.1 --port "$VOICE_PORT" --app-dir "$ROOT/services/voice"

log "Starting nginx on :$PORT…"
spawn "[web]  " nginx -c "$NGINX_DIR/nginx.conf" -p "$NGINX_DIR"

# --- readiness ------------------------------------------------------------
wait_for() {
  local name="$1" url="$2"
  for _ in $(seq 1 60); do
    curl -fsS --max-time 2 "$url" >/dev/null 2>&1 && { log "$name ready"; return 0; }
    sleep 0.5
  done
  warn "$name did not answer $url after 30s"
  return 1
}
wait_for "api  " "http://127.0.0.1:$API_PORT/api/health" || true
wait_for "voice" "http://127.0.0.1:$VOICE_PORT/health"   || true
wait_for "web  " "http://127.0.0.1:$PORT/"               || true

printf '\n'
log "Dashboard running at http://localhost:$PORT  (Ctrl-C to stop)"
log "Logs: $LOG_DIR/nginx-{access,error}.log"

wait -n
warn "a service exited — stopping the rest"
