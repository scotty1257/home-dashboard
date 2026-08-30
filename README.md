# Home Dashboard

A fast, colorful, touch-first home dashboard for a Linux touchscreen. It combines
an editable calendar, current and upcoming activity, weather, Spotify playback,
Home Assistant device control, and a custom AI voice assistant — all behind a
polished, touch-optimized UI.

> **Target:** landscape touchscreen (1920×1080 recommended), runs entirely on the
> local network. Cached data keeps the dashboard useful offline.

## Features

- **Editable calendar** — tap a cell to create an event, tap an event to edit it.
  Month/week-day views, all-day events, recurrence, reminders, color coding.
- **Now & upcoming** — ongoing events, now playing, open doors/locks, and upcoming
  events ranked in one glanceable feed.
- **Weather** — current conditions, hourly and 7-day forecast (Open-Meteo, no key),
  cached so it renders offline.
- **Music (Spotify)** — now playing, play/pause/next/prev, seek, volume, device
  handoff. Works in demo mode with no credentials.
- **Home Assistant** — lights, switches, climate, covers, locks, fans, media, and
  scenes with capability-driven controls and an on-screen confirmation for
  security-sensitive actions.
- **Voice assistant** — push-to-talk (browser speech-to-text), a provider-neutral
  STT/LLM/TTS pipeline, and a strict, schema-validated tool registry so the AI can
  only perform safe, registered actions. High-risk actions require a tap to confirm.
- **Family coordination** — handoffs between adults (with a chime alert before the
  handoff time), a permission queue for kid requests with an append-only decision
  trail, a duty ledger of recurring chores with credit tracking, short voice notes
  recorded right on the kiosk, and launch sequences (templates of guided steps for
  routines like bedtime or leaving for school).
- **Settings** — theme (light/dark/auto), accent color, units, timezone, night mode,
  voice behavior, integration status.

## Architecture

```
apps/dashboard-web     React + Vite + TanStack Query + Zustand (touch UI)
services/api           Fastify + SQLite (node:sqlite) — calendar, weather, home,
                       Spotify, activity, settings, SSE, validated voice tools
services/voice         FastAPI — STT/intent/TTS pipeline, provider-neutral
packages/contracts     Zod schemas + types shared by web and API
packages/design-tokens CSS + TS design tokens (colors, spacing, motion)
```

The dashboard never stores provider secrets; the API owns credentials, caching,
and the activity feed. The voice service proposes tool calls but can only execute
them through the API's validated tool registry.

## Quick start (development)

```bash
# prerequisites: Node 20+, pnpm 10, Python 3.11+
corepack enable   # or: npm install -g pnpm@10

pnpm install
cp .env.example .env          # optional; demo mode works without it

# voice service (one-time)
cd services/voice && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && cd ../..

pnpm dev                      # starts web (5173), api (8787), voice (8788)
```

Open **http://localhost:5173**. Everything runs in demo mode until you add
credentials.

## Configuration

All settings live in `.env` (see `.env.example`):

| Variable | Purpose |
|---|---|
| `HA_URL` / `HA_TOKEN` | Home Assistant URL + long-lived access token (enables real devices) |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify app credentials (enables real playback) |
| `WEATHER_LATITUDE` / `WEATHER_LONGITUDE` | Fixed weather location |
| `STT_PROVIDER` / `LLM_PROVIDER` / `TTS_PROVIDER` | Voice providers (`local` = no keys needed) |
| `VOICE_NOTE_DIR` | Directory storing voice-note audio (default `./var/voice-notes`; `/data/voice-notes` in Docker) |
| `VOICE_NOTE_MAX_BYTES` | Voice-note upload cap in bytes (default 8 MiB; nginx allows 12 MiB bodies) |
| `VOICE_NOTE_RETENTION_DAYS` | Days before voice notes are pruned, lazily on list (default 30) |

Timezone is not an env var: set it in **Settings** (stored in the settings
table as an IANA zone, default `UTC`) so handoff alerts fire at local hours.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run web + API + voice together |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Type-check every package |
| `pnpm test` | Run Node (Vitest) + Python (pytest) tests |
| `pnpm --filter @home-dashboard/web build` | Production web build → `apps/dashboard-web/dist` |

## Deployment

See **[docs/linux-installation.md](docs/linux-installation.md)** for the systemd +
nginx kiosk install, and **[docs/operations.md](docs/operations.md)** for
day-to-day operation, backups, and troubleshooting.

Containerized deployment is available via `docker compose up --build`.

## Security model

- The voice assistant has a **closed tool registry** — no arbitrary HTTP/shell.
- Every tool argument is schema-validated; unknown tools and entities are rejected.
- Actions are risk-classified: read-only, reversible, sensitive, destructive.
- Sensitive/destructive actions (locks, doors) require on-screen confirmation.
- All actions are audit-logged; device changes are confirmed by read-back.
- Voice notes are stored locally only (on-disk under `VOICE_NOTE_DIR`) — never
  uploaded to a third party — and expire after `VOICE_NOTE_RETENTION_DAYS`.
- Permission decisions are an append-only audit trail: every kid request keeps
  its full decision history in the `permission_decisions` table.

## License

MIT
