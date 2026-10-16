#!/usr/bin/env bash
set -euo pipefail
# Run isolated benchmark sets serially. Default 24h, 5 JVMs, real captures.
export BENCH_COUNTS="${BENCH_COUNTS:-5}"
export BENCH_SECONDS="${BENCH_SECONDS:-86400}"
export BENCH_OUTPUT="${BENCH_OUTPUT:-.cache/soak-24h.json}"
export BENCH_SAMPLES_OUTPUT="${BENCH_SAMPLES_OUTPUT:-.cache/soak-samples.jsonl}"
npm run benchmark
