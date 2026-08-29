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

The only persistent state is the SQLite database and `.env`:

```bash
cp /opt/home-dashboard/var/dashboard.sqlite /backup/dashboard-$(date +%F).sqlite
cp /opt/home-dashboard/.env /backup/.env.$(date +%F)
```

To restore, stop the API, replace the database file, and restart.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Dashboard shows demo devices | No `HA_URL`/`HA_TOKEN` in `.env` | Add Home Assistant URL + long-lived token, restart API |
| Music stuck in "demo" | Spotify not configured/authorized | Add credentials, then **Settings → Integrations → Connect** |
| Weather shows "offline" | No internet or Open-Meteo unreachable | Check network; dashboard serves cached data |
| Voice says "couldn't reach assistant" | Voice service down | `systemctl restart home-dashboard-voice` |
| Blank kiosk screen | nginx/web not up, or Chromium crashed | Check nginx + api; restart kiosk unit |
| Live updates not flowing | SSE connection dropped | The client auto-reconnects; check nginx `proxy_buffering off` |

## Security notes

- Bind services to `127.0.0.1` (the default) — only nginx on `:8080` is exposed.
- Provider secrets live only in `.env` (never in the browser or API responses).
- Voice high-risk actions require on-screen confirmation; audit history is in the
  SQLite `audit_log` table.
- The `.kiosk` Chromium profile is disposable; it holds no secrets.

## Data retention

- Calendar events and settings persist in SQLite indefinitely.
- Voice transcripts/audio are ephemeral (not persisted) unless you configure a
  logging provider.
- Activity and audit rows accumulate in SQLite; prune periodically if desired:

  ```sql
  DELETE FROM activity_log WHERE at < datetime('now', '-90 days');
  DELETE FROM audit_log    WHERE at < datetime('now', '-90 days');
  ```
