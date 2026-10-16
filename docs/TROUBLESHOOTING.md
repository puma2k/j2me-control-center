# Troubleshooting

| Symptom | Check / action |
|---|---|
| Cannot start Compose | Set ADMIN_PASSWORD (12+ chars), Docker daemon running, Compose v2 installed. Inspect `docker compose logs api`. |
| Startup failure / Java exits immediately | Exact JVM encoding must be `ISO_8859_1` for this pinned emulator. The bridge already supplies it. Inspect instance logs. |
| Empty frame | Start the instance, open detail/grid, inspect runtime log and state. Capture begins only for viewers. Games waiting for a menu/key may be blank until input. |
| Invalid JAR | Require valid ZIP + MIDlet-Name/MIDlet-1 + actual entry class; desktop Java JARs are unsupported. CRC, zip expansion and traversal are checked. |
| JAD rejected | Upload matching JAR first; attach via the game's JAD button. URLs must be local filenames. No remote fetching. |
| Quota exceeded | Stop unused instances; increase environment hard caps and container memory only after measuring. Each start reserves heap+128MB. |
| Container OOM | Lower heap/FPS/concurrency; container memory caps total RSS, not just heap. An OOM kill appears in `docker inspect`. |
| No sound | Sound intentionally disabled. Audio/game compatibility is not guaranteed. |
| Game has wrong keys | Choose profile before start; use per-instance keyboard mapping. Vendor APIs/keycodes vary. |
| Lost connection | Same-origin cookie and WS Origin must match; proxy must support WebSocket Upgrade. Logout/expiry revokes WS. Blur/disconnect releases held keys. |
| Port 3000 occupied | Change PORT in .env; do not expose runtime ports. |
| Login fails behind HTTPS | Set PUBLIC_ORIGIN to exact HTTPS URL and COOKIE_SECURE=true; access same hostname. |
| Node tests crash locally | Use Node24 (`nvm use`), reinstall with `npm ci`; Node23 is unsupported. |
| Restart did not restore in-game screen | restore-running only starts the game again. Persisted RMS survives; runtime memory does not. |
| Need API details | Log in first, visit /docs or docs/API.md. |

Runtime logs rotate at ~1 MiB with one retained previous file. Docker service logs rotate 3×10 MiB. Audit events retain most recent 10,000. Instance log API returns last 64 KiB.

Backups pause service for consistent DB, game files and saves. Restore overwrites volume contents; take a backup before restoring. Use only archives created by supplied scripts. Private `.env` credentials must be stored separately from volume archives.
