# Measured benchmarks

Measured at 2026-10-15T16:02:28.189Z on Apple M1 / Docker Desktop Linux arm64. Docker VM: 8 CPUs and 7837 MiB RAM. Container benchmark caps: 4 CPUs, 7 GiB memory, 20 admitted instances, 6144 MiB admission budget.

Game: original MIT Control Test (offline MIDP2/CLDC1.1), native 240×320, game FPS cap 30, heap 128 MiB per JVM, sound off. This test game paints on input; it is much lighter than an animated commercial game. One WS client views up to nine instances at requested 10 FPS, JPEG quality 75. Other JVMs remain running without frame capture. An HTTP native PNG capture is also requested once per sample.

| JVMs | Viewed | Sample window | Mean JVM CPU sum | Mean JVM RSS sum | Delivered FPS / viewed instance | Mean PNG HTTP time | Max PNG HTTP time |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 15.18s / 15 samples | 4.72% | 117.9 MiB | 8.96–8.96 | 6.67 ms | 21 ms |
| 5 | 5 | 15.33s / 15 samples | 25.05% | 524.4 MiB | 9.07–9.07 | 9.13 ms | 32 ms |
| 10 | 9 | 16.00s / 15 samples | 43.10% | 1066.8 MiB | 8.19–8.25 | 12.40 ms | 58 ms |
| 20 | 9 | 15.35s / 15 samples | 49.60% | 2079.4 MiB | 9.38–9.38 | 8.47 ms | 17 ms |

All sampled JVMs retained valid PIDs during these short runs. This is a short smoke benchmark, **not** a completed soak or a capacity guarantee. CPU is summed JVM CPU from /proc, with 100% meaning one fully used core; excludes Node/Xvfb. RSS is summed JVM RSS and may double-count shared pages. Delivered FPS is counted from real received WS frames, not the emulator render rate. PNG time includes local HTTP/capture roundtrip; it is not input-to-photon latency. A cross-architecture Docker build ran concurrently, so host contention and cold starts affect comparability.

Raw data: [benchmark-arm64.json](evidence/benchmark-arm64.json). Reproduce after exporting/uploading the legal fixture:

```sh
MAX_INSTANCES=20 MEMORY_BUDGET_MB=6144 CONTAINER_MEMORY=7g CONTAINER_CPUS=4 docker compose up -d
BENCH_COUNTS=1,5,10,20 BENCH_SECONDS=60 npm run benchmark
# Restore the default production caps:
docker compose up -d
```

For 24-hour verification use `scripts/soak.sh` with no competing workload; its result must be inspected before claiming stability or no leaks. No completed 24-hour run is included. No 50–100 instance result or online/commercial-game performance claim is made.

## Low-resource follow-up (2026-10-16)

The runtime now captures reusable raw RGB buffers into tmpfs, encodes JPEG without a PNG roundtrip, and shares recently encoded frames between viewers. The browser updates image elements directly and unsubscribes from streams while hidden. JVM startup uses an 8 MiB initial heap, SerialGC and a 32 MiB reserved code cache. Defaults are 20 game FPS, 8 stream FPS and JPEG quality 60; the supplied NRO instance uses a 128 MiB maximum Java heap. Heap is only part of total process memory.

Short, approximately 10-second launcher samples with the same 256 MiB heap / 30 game FPS / 10 stream FPS / quality 75 measured mean JVM RSS of 89.0 MiB before and 62.2 MiB after, delivering 88 frames and 840752 JPEG bytes in each run. These cold/startup samples are not a sustained gameplay comparison; CPU sampling was noisy and does not establish a CPU improvement. See light-before.json and light-after.json in evidence.

The light-profile samples use different scenes and are included as observations, not an apples-to-apples percentage saving. Actual resource use varies with game state, viewers and JVM warm-up. No prolonged gameplay or new capacity guarantee is claimed.

Online character-screen observation at the light profile: mean JVM RSS 141.7 MiB, whole-container CPU 12.9% of one core across approximately 10 seconds, 78 delivered frames. A subsequent Docker snapshot reported 208 MiB for the entire app container (API, JVM and Xvfb). The 3 GiB shown by Docker is a limit, not allocated memory. Raw observation: evidence/light-online.json.

## User-required 60 FPS follow-up

The 20-game/8-stream FPS preset above was superseded at the user's request. Game and stream targets now default to 60 FPS, including the existing NRO instance; memory/image optimizations remain. WebSocket schemas accept 60, the UI offers 60, the scheduler wakes every 2 ms and carries forward deadlines to avoid cumulative timer rounding, and the shared JPEG cache expires after 8 ms so it cannot limit distinct frames to approximately 33 FPS. Configured FPS is a target, not a guarantee of game-internal or received FPS under every load. Short measurements are saved separately as fps60 evidence.

Final short sample at the NRO online menu, 128 MiB heap, 60 game/stream FPS target, JPEG quality 60: 625 frames over approximately 10 seconds, mean JVM RSS 138.4 MiB; whole-container CPU 41.5% of one core. A subsequent container snapshot was 198.5 MiB. An additional browser viewer was present. These exclude Docker Desktop VM overhead and are not peak gameplay requirements. Evidence: evidence/fps60-final.json. Typecheck and 26 unit tests passed; production Docker rebuild passed.

## Measured heap and native-memory tuning

Read-only `scripts/profile-memory.sh` samples each running game JVM with `jcmd GC.heap_info`, VM flags, Linux RSS/PSS and 10 `jstat -gc` observations. It does not dump object contents or request a full GC. Heap used is Eden + active survivor + old-generation used; committed heap is the sum of generation capacities. RSS additionally includes class metadata, compiled code, native allocations and shared libraries. An Xmx reduction is not equivalent to an RSS saving.

The existing NRO menu before this follow-up used approximately 14–15 MiB heap, while JVM RSS was about 136 MiB. The preceding exploratory class histogram requested a full GC; the baseline sampling file records that history. Menu samples cannot establish the maximum heap required in maps or prolonged play, so the 128 MiB ceiling is retained.

Changes: glibc MALLOC_ARENA_MAX defaults to 2 for emulator child processes (operator override preserved), SerialGC free-heap ratios 10/20 reduce unused committed heap after collections, and C1-only tiered compilation avoids C2 compiler overhead. No periodic forced GC, image-resolution reduction or FPS reduction is introduced. Both game and stream targets remain 60 FPS.

After the combined memory changes, two short online-menu samples measured mean JVM RSS 76.3 / 76.5 MiB, versus the previous 60 FPS run's 138.4 MiB (approximately 45% lower, short menu observations rather than a guaranteed gameplay saving). The final sample received 624 frames in approximately 10 seconds, whole-container CPU 45.3% of one core with an additional browser viewer; prior 60 FPS sample was 41.5%, so no CPU saving is claimed. Read-only after sample records approximately 14 MiB used heap and 18 MiB generation capacity. A Docker snapshot during the new run reported 176.3 MiB for the entire app, excluding Docker Desktop VM overhead. Tests had recently run in this container, affecting Node/native warm-up state. Raw evidence: memory-before.txt, memory-after.txt, memory-warmup.json, memory-final.json. Longer heavy gameplay and peak memory remain unmeasured.

## Idle-screen observation

Same supplied NRO online menu with only the in-app browser viewing, 60 game/stream FPS configured. A separate HTTP/cgroup sampler did not open a frame subscription. Approximately 10-second whole-container CPU samples measured 43.7% of one core while viewing and 9.1% after the 30-second idle screen unsubscribed. Mean JVM RSS was 77.8 and 77.9 MiB respectively: this saves capture/encode/transmission work, not the game's retained heap. JVM PID and game FPS configuration remained unchanged. This is a short menu observation, not a map/auto-gameplay result or VPS capacity estimate. Other active viewers still require image work. Raw evidence: idle-active.json, idle-sleeping.json.
