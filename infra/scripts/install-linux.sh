#!/usr/bin/env bash
# Home Dashboard — Linux install script (Debian/Ubuntu + systemd).
# Installs dependencies, builds the app, configures systemd + nginx.
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/home-dashboard}"
REPO_URL="${REPO_URL:-}"

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
err() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
  err "run as root (sudo ./install-linux.sh)"
fi

log "Installing system packages…"
apt-get update -qq
apt-get install -y -qq nginx chromium chromium-driver curl ca-certificates python3-venv

log "Installing Node + pnpm…"
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y -qq nodejs
fi
if ! command -v pnpm >/dev/null; then
  npm install -g pnpm@10
fi

if [ -d "$INSTALL_DIR" ] && [ -z "$REPO_URL" ]; then
  log "Using existing source at $INSTALL_DIR"
else
  log "Cloning source to $INSTALL_DIR…"
  if [ -z "$REPO_URL" ]; then
    err "REPO_URL is required when $INSTALL_DIR does not exist"
  fi
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

log "Installing Node dependencies…"
pnpm install --frozen-lockfile || pnpm install

log "Setting up voice service virtualenv…"
( cd services/voice && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt )

log "Building the web app…"
pnpm --filter @home-dashboard/web build

log "Configuring environment…"
if [ ! -f .env ]; then
  cp .env.example .env
  log "Created .env from template — edit it to add Home Assistant / Spotify credentials."
fi

log "Creating service user…"
id -u dashboard >/dev/null 2>&1 || useradd --system --home "$INSTALL_DIR" --shell /usr/sbin/nologin dashboard
mkdir -p "$INSTALL_DIR/var"
chown -R dashboard:dashboard "$INSTALL_DIR"

log "Installing systemd units…"
sed "s#/opt/home-dashboard#$INSTALL_DIR#g" \
  infra/systemd/home-dashboard-api.service   > /etc/systemd/system/home-dashboard-api.service
sed "s#/opt/home-dashboard#$INSTALL_DIR#g" \
  infra/systemd/home-dashboard-voice.service > /etc/systemd/system/home-dashboard-voice.service
sed "s#/opt/home-dashboard#$INSTALL_DIR#g" \
  infra/systemd/home-dashboard-kiosk.service > /etc/systemd/system/home-dashboard-kiosk.service

systemctl daemon-reload
systemctl enable --now home-dashboard-api home-dashboard-voice

log "Configuring nginx…"
sed "s#/opt/home-dashboard#$INSTALL_DIR#g" \
  infra/nginx/home-dashboard.conf > /etc/nginx/sites-available/home-dashboard
ln -sf /etc/nginx/sites-available/home-dashboard /etc/nginx/sites-enabled/home-dashboard
# Remove the default site if present
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

log "Done. The dashboard is available at http://<host>:8080"
log "To enable the kiosk (fullscreen Chromium): systemctl enable --now home-dashboard-kiosk"
