#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
dest="${1:-backups/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$dest"
dest="$(cd "$dest" && pwd)"
# Quiesce JVMs and SQLite for a consistent all-volume backup.
docker compose stop api
trap 'rm -f "$dest/control-center.tar.gz.tmp"; docker compose start api >/dev/null' EXIT
docker compose run --rm --no-deps -T --entrypoint tar api czf - -C /data . > "$dest/control-center.tar.gz.tmp"
mv "$dest/control-center.tar.gz.tmp" "$dest/control-center.tar.gz"
chmod 600 "$dest/control-center.tar.gz"
printf 'Backup: %s/control-center.tar.gz\n' "$dest"
