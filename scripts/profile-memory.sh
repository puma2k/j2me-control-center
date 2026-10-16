#!/usr/bin/env bash
# Read-only JVM heap/RSS sampling. Run from the project root while games are running.
set -euo pipefail
docker compose exec -T api sh -eu -c '
  pids=$(jcmd -l | awk "/ Bridge / {print \$1}")
  if [ -z "$pids" ]; then echo "No running game JVMs"; exit 1; fi
  for pid in $pids; do
    echo "Game JVM PID $pid"
    jcmd "$pid" GC.heap_info
    jcmd "$pid" VM.flags
    cat "/proc/$pid/smaps_rollup"
    jstat -gc "$pid" 1000 10
  done
'
