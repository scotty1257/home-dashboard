# Linux Installation

Turn a Linux machine (Raspberry Pi, mini PC, old laptop) into an always-on
touchscreen dashboard that boots straight into a fullscreen kiosk.

## Overview

- **nginx** serves the built web app and reverse-proxies the API and voice service.
- **systemd** runs three units: `home-dashboard-api`, `home-dashboard-voice`, and
  the optional `home-dashboard-kiosk` (fullscreen Chromium).
- The API and voice service run as a dedicated `dashboard` user with hardened
  sandboxing (`ProtectSystem=strict`, `NoNewPrivileges`, `PrivateTmp`).

## One-command install

```bash
sudo INSTALL_DIR=/opt/home-dashboard REPO_URL=https://github.com/you/home-dashboard \
  bash infra/scripts/install-linux.sh
```

The script installs packages, builds the app, creates the `dashboard` user, sets up
a `.env` from the template, and installs the systemd units and nginx config.

After it finishes, edit `/opt/home-dashboard/.env` to add Home Assistant and
Spotify credentials, then:

```bash
sudo systemctl restart home-dashboard-api
```

## Manual steps

1. **Dependencies:** nginx, chromium, Node 20+, pnpm 10, Python 3.11+.
2. **Install & build:**
   ```bash
   cd /opt/home-dashboard
   pnpm install
   cd services/voice && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ../..
   pnpm --filter @home-dashboard/web build
   ```
3. **Configure** `.env` (see `.env.example`).
4. **Install units** (`infra/systemd/*.service` → `/etc/systemd/system/`), adjusting
   paths if you didn't use `/opt/home-dashboard`.
5. **Install nginx config** (`infra/nginx/home-dashboard.conf` →
   `/etc/nginx/sites-available/`, symlink to `sites-enabled`, remove default site).
6. Enable services:
   ```bash
   sudo systemctl enable --now home-dashboard-api home-dashboard-voice
   sudo systemctl enable --now home-dashboard-kiosk   # fullscreen Chromium
   ```

## Kiosk details

The kiosk unit launches Chromium with `--kiosk` and a dedicated profile
(`/opt/home-dashboard/.kiosk`), pointing at `http://127.0.0.1:8080`. Autoplay is
allowed so voice replies and media can play without a click.

To exit the kiosk for maintenance, attach a keyboard and press `Alt+F4`, or stop
the unit:

```bash
sudo systemctl stop home-dashboard-kiosk
```

For a PIN-protected exit, wrap the exit gesture in your window manager or use a
physical keyboard shortcut configured outside the dashboard.

## Touchscreen & display

- Disable screen blanking/screensaver via your display server or `xset`.
- For burn-in protection, enable **night mode** in Settings (dims colors and keeps
  static header content subtle).
- Recommended resolution 1920×1080 landscape; the UI is responsive down to 720p
  and adapts to portrait.

## Raspberry Pi notes (future)

The current development target is a generic Linux box. When moving to a Pi:

- Run the API + voice from the Pi but consider serving the web bundle with a
  lighter static server if nginx feels heavy.
- Verify Chromium GPU settings for the Pi's compositor (`--disable-gpu-compositing`
  may help on some models).
- Profile startup time; the web bundle is already route-split and ~10 KB gzipped
  for the main chunk.
