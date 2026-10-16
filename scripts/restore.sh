#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
archive="${1:?Usage: scripts/restore.sh /absolute/path/to/control-center.tar.gz}"
archive="$(cd "$(dirname "$archive")" && pwd)/$(basename "$archive")"
[[ -f "$archive" ]] || { echo 'Backup archive not found' >&2; exit 1; }
# Validate paths before extracting. Use only backups created by backup.sh.
python3 - "$archive" <<'PY'
import sys,tarfile,pathlib
with tarfile.open(sys.argv[1]) as t:
 for m in t:
  p=pathlib.PurePosixPath(m.name)
  if p.is_absolute() or '..' in p.parts or m.issym() or m.islnk(): raise SystemExit('Unsafe backup archive')
PY
docker compose stop api
# Clear the three mounted volumes without deleting volume identities.
docker compose run --rm --no-deps --user 1000:1000 --entrypoint node api -e 'const fs=require("fs");for(const p of fs.readdirSync("/data")){if(p==="games"||p==="state"){for(const f of fs.readdirSync("/data/"+p))fs.rmSync("/data/"+p+"/"+f,{recursive:true,force:true});}else fs.rmSync("/data/"+p,{recursive:true,force:true});}'
docker compose run --rm --no-deps -T --entrypoint tar api xzf - --no-same-owner -C /data < "$archive"
docker compose start api
