# J2ME Control Center — release checklist

Bản yêu cầu gốc: [docs/TASKS.original.md](docs/TASKS.original.md). Phạm vi triển khai và giới hạn: [docs/STATUS.md](docs/STATUS.md). Chỉ tick các hạng mục có code và bằng chứng đã chạy; không coi toàn bộ roadmap tương lai là hoàn tất.

## Đã triển khai và kiểm thử

- [x] Monorepo React/Vite + Fastify/TypeScript + shared Zod + runtime adapter.
- [x] Pin/build FreeJ2ME-Plus từ source; xác minh artifact/entrypoint/Java.
- [x] Chạy MIDlet hợp pháp headless, frame và keydown/keyup thật.
- [x] Mỗi instance một JVM/Xvfb, cwd/RMS/config riêng.
- [x] Docker Compose, multi-stage build, SQLite WAL/versioned migration, volumes persistent.
- [x] Non-root/read-only/no capabilities/init/healthcheck/restart/log rotation.
- [x] JAR/JAD upload, ZIP/CRC/expansion/path checks, manifest, SHA-256, library search/relabel/delete.
- [x] Tạo/cấu hình/start/stop/restart/delete, bulk results, quota và chống lifecycle race.
- [x] Crash recovery có retry/backoff giới hạn, reconcile và restore-running/manual.
- [x] Frame JPEG qua authenticated WS, native PNG screenshot, viewer-only capture, backpressure/drop policy.
- [x] Dashboard desktop/mobile, grid 1/2/4/9, logs và CPU/RSS/PSS/uptime/stream counters thật.
- [x] Gamepad cảm ứng/keyboard, mapping, multi-target, giữ/thả phím đúng giữa nhiều viewer.
- [x] Session auth/CSRF/Origin/login limits, WS expiry/revocation, bcrypt và audit events.
- [x] Macro bounded/cancellable với ownership riêng, không bypass anti-cheat.
- [x] Save export/import có giới hạn và rollback; backup/restore toàn volume đã roundtrip thực tế.
- [x] 22 backend/regression tests; lint/typecheck/production build; zero npm audit vulnerabilities.
- [x] 7 browser/real-emulator E2E trên native Linux arm64.
- [x] Build image amd64 và chạy đủ 7 E2E qua CPU emulation trên Apple M1; điều kiện test được ghi rõ trong VERIFICATION.md.
- [x] Benchmark thật 1/5/10/20 JVM bằng game test hợp pháp; không dùng số liệu ước lượng.
- [x] README, API/architecture/troubleshooting/license/compatibility/evidence và CI config.

## Các gate chưa được xác nhận hoặc chưa triển khai

- [ ] Chạy cài mới trên VPS Ubuntu x86_64 vật lý/remote chỉ có Docker + .env (không có VPS được cung cấp).
- [ ] Hoàn tất soak 24h với 5 instance và chứng minh không leak dài hạn (có runner).
- [ ] Kiểm chứng nhiều game độc lập, vendor/M3G/audio và một online game/server hợp pháp.
- [ ] Cô lập JAR độc hại bằng sandbox riêng + hard CPU/RSS/network/filesystem cap cho từng JVM.
- [ ] RBAC/ownership nhiều user, multi-node workers/queue/scheduler/object store/stream gateway.
- [ ] WebRTC nếu benchmark chứng minh cần thiết; direct framebuffer hiện đã được dùng.
- [ ] Benchmark 50–100 instance và autoscaling bằng workload thực tế.
- [ ] Chạy GitHub-hosted CI/Trivy và deploy domain HTTPS công khai (chưa có repo/domain/host đích).

Bằng chứng và kiến trúc: [docs/VERIFICATION.md](docs/VERIFICATION.md), [docs/BENCHMARKS.md](docs/BENCHMARKS.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
