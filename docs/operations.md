# Operations

Day-to-day running, monitoring, backup, and troubleshooting for the Home Dashboard.

## Service status & logs

```bash
systemctl status home-dashboard-api home-dashboard-voice home-dashboard-kiosk
journalctl -u home-dashboard-api -f      # follow API logs
journalctl -u home-dashboard-voice -f    # follow voice logs
```

Run the health check:

```bash
bash infra/scripts/health-check.sh
```

## Restart / upgrade

```bash
cd /opt/home-dashboard
git pull
pnpm install
pnpm --filter @home-dashboard/web build
sudo systemctl restart home-dashboard-api home-dashboard-voice
sudo systemctl reload nginx
```

## Backups

Persistent state is the SQLite database, the voice-note audio directory, and
`.env`:

```bash
# SQLite — use .backup for a consistent copy while the API is running
sqlite3 /opt/home-dashboard/var/dashboard.sqlite \
  ".backup /backup/dashboard-$(date +%F).sqlite"
# Voice-note recordings (files are not in the database)
rsync -a --delete /opt/home-dashboard/var/voice-notes/ /backup/voice-notes/
cp /opt/home-dashboard/.env /backup/.env.$(date +%F)
```

To restore, **stop the API first** (a SQLite file swapped mid-write can be
corrupted), put the files back, and restart:

```bash
sudo systemctl stop home-dashboard-api
cp /backup/dashboard-2026-01-31.sqlite /opt/home-dashboard/var/dashboard.sqlite
rsync -a /backup/voice-notes/ /opt/home-dashboard/var/voice-notes/
sudo systemctl start home-dashboard-api
```

## Family data

Everything the family-coordination features store lives in the same SQLite
database — no external services:

| Table | Feature |
|---|---|
| `household_members`, `backup_contacts` | Household roster and emergency contacts |
| `handoff_obligations` | Active and completed handoffs between adults |
| `permission_requests`, `permission_decisions`, `permission_rules` | Permission queue; decisions form an append-only audit trail |
| `duty_definitions`, `duty_entries` | Duty ledger (recurring chores and credit) |
| `voice_notes` | Voice-note metadata; the audio files live on disk (below) |
| `launch_templates`, `launch_steps`, `launch_runs`, `launch_step_completions` | Launch-sequence templates and per-run progress |

**Voice notes on disk.** Audio files are stored under `VOICE_NOTE_DIR`
(default `./var/voice-notes`, i.e. `/opt/home-dashboard/var/voice-notes` in a
standard install; `/data/voice-notes` on the `dashboard-data` volume in
Docker). The directory must be writable by the `dashboard` user — the API also
creates it on startup. Verify with:

```bash
bash infra/scripts/check-voice-notes.sh
```

**Retention.** Notes older than `VOICE_NOTE_RETENTION_DAYS` (default 30) are
pruned lazily: whenever a recipient's note list is fetched, the API first
deletes expired rows and their files. There is no background timer, so expired
notes linger until the next list fetch. Change the window by setting
`VOICE_NOTE_RETENTION_DAYS` in `.env` and restarting the API; set
`VOICE_NOTE_MAX_BYTES` (default 8 MiB) to cap upload size.

## Kiosk microphone & speaker

Recording voice notes and playing the handoff chime need Chrome permissions on
the kiosk profile:

1. Exit the kiosk (`Alt+F4` or `sudo systemctl stop home-dashboard-kiosk`), then
   open the site in a normal Chrome window using the kiosk profile
   (`/opt/home-dashboard/.kiosk`).
2. Go to `chrome://settings/content/microphone`, select the correct input
   device, and allow `http://127.0.0.1:8080` for the microphone.
3. Open the dashboard, record a voice note, and play it back to confirm both
   microphone and speaker work end-to-end.
4. Relaunch the kiosk (`sudo systemctl start home-dashboard-kiosk`).

**Autoplay:** Chrome blocks audio until the user has interacted with the page.
The first time a launch-sequence chime is due, the dashboard shows a **"Tap to
enable chime"** button — tap it once and the chime (and later ones) plays
without further prompts.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Dashboard shows demo devices | No `HA_URL`/`HA_TOKEN` in `.env` | Add Home Assistant URL + long-lived token, restart API |
| Music stuck in "demo" | Spotify not configured/authorized | Add credentials, then **Settings → Integrations → Connect** |
| Weather shows "offline" | No internet or Open-Meteo unreachable | Check network; dashboard serves cached data |
| Voice says "couldn't reach assistant" | Voice service down | `systemctl restart home-dashboard-voice` |
| Blank kiosk screen | nginx/web not up, or Chromium crashed | Check nginx + api; restart kiosk unit |
| Live updates not flowing | SSE connection dropped | The client auto-reconnects; check nginx `proxy_buffering off` |
| Voice notes won't upload | `VOICE_NOTE_DIR` not writable, or recording over the size limit (API returns 413) | Run `bash infra/scripts/check-voice-notes.sh`; check `VOICE_NOTE_MAX_BYTES` and that nginx `client_max_body_size` is at least 12m |
| Chime silent | Chrome autoplay policy blocks unattended audio | Tap **"Tap to enable chime"** when shown, or relaunch the kiosk with autoplay allowed (`--autoplay-policy=no-user-gesture-required`) |
| Handoff alerts at odd hours | Dashboard timezone not set to the local zone | Set the timezone in **Settings** (IANA name, e.g. `America/New_York`); check the host with `timedatectl` |

## Security notes

- Bind services to `127.0.0.1` (the default) — only nginx on `:8080` is exposed.
- Provider secrets live only in `.env` (never in the browser or API responses).
- Voice high-risk actions require on-screen confirmation; audit history is in the
  SQLite `audit_log` table.
- The `.kiosk` Chromium profile is disposable; it holds no secrets.

## Data retention

- Calendar events and settings persist in SQLite indefinitely.
- Voice-assistant transcripts are ephemeral (not persisted) unless you
  configure a logging provider. Voice **notes** are the exception — they are
  stored locally under `VOICE_NOTE_DIR` and pruned after
  `VOICE_NOTE_RETENTION_DAYS` (default 30; see *Family data* above).
- Activity and audit rows accumulate in SQLite; prune periodically if desired:

  ```sql
  DELETE FROM activity_log WHERE at < datetime('now', '-90 days');
  DELETE FROM audit_log    WHERE at < datetime('now', '-90 days');
  ```
