# Execution record

2026-10-15, native implementation in initially empty workspace.
User explicitly requested full autonomous work without questions. Requirements are in TASKS.original.md.

- Design/plan recorded; decisions follow supplied monorepo architecture.
- FreeJ2ME-Plus commit baca76a4dda6f30abac67fb4a3db009eed05f91c: source verified, `ant ... jar-standalone` -> `build/freej2me_plus.jar` compiled on Java 8 Linux.
- Runtime spike passed: CONTROL_READY, CONTROL_FRAME, TEST_KEY -5 COUNT 1, TEST_RELEASE -5, CONTROL_FRAME. Screenshot visually inspected: 240×320, Keys 1, Last -5, RMS boots 1.
- Found upstream requires exact encoding ISO_8859_1; other alias triggers a silent restart. Runtime uses exact value.
- Schema/library/store tests: pass. Lifecycle quota concurrency and reconcile tests: pass. Auth/CSRF/session tests: pass.
- Ruling: direct MobilePlatform framebuffer/input bridge is used after successful probe, with separate Xvfb retained for AWT compatibility. This is simpler and more reliable than desktop screenshot/xdotool.
- Ruling: one service serves SPA/API/runtime. Container limits are shared; per-instance heap plus overhead admission is not a hard per-instance RSS cap. Never label shared JVM container as hostile-code sandbox.
- Ruling: default is single admin on localhost/VPN. Multi-node/RBAC and 50–100 instance throughput require later infrastructure validation rather than pretending to be production-tested.
- Node dependencies pinned in package-lock.json; audited vulnerable initial versions replaced before delivery.
- Independent review found backup capability assumptions, game deletion/creation race, persisted limit bypass and idle WS revocation gap. Added regression tests and fixed all four. JAD concern was checked against upstream auto-discovery and a real emulator property test (passed).
- Additional tests found invalid ZIP CRC acceptance: added streaming checksum verification. Two-viewer ownership is now serialized globally via InputBroker, preventing cross-socket ownership races.
- Save export/import implements staged bounded RMS/config archives under lifecycle lock. Macro execution has separate key ownership, cancellation, bounded duration and audit events.
- Browser E2E initially caught empty POST with JSON Content-Type: header now set only for actual JSON bodies. Five initial browser/integration E2E tests passed after correction.
- Backup/restore helpers use runtime UID and tar streams so host UID mismatch does not require root capabilities. Actual archive export/import run completed.
- Final focused review: fixed large-base64 regex stack overflow, Unicode save roundtrip rejection, stale key ownership after runtime restart, and backup confidentiality during creation. Regression suite now 21/21. Backup uses umask 077 and removes partial archives on failure. No reviewed important finding is deferred.
- Lint (Prettier), typecheck, tests, production build and npm audit passed; audit reported zero vulnerabilities. Seven full browser/runtime E2E tests passed on native Linux arm64 container.
- Ruling: cross-platform Java bytecode is compiled using the build host's Java 8; target Java runtime comes from the target-platform Temurin stage. This avoids running the Java compiler through CPU emulation while preserving correct runtime architecture.

- Slow amd64 CPU-emulation testing exposed the fixed 30s startup cutoff; startup timeout is now configurable (default 60s, validated range 1–300s). Unit regression added; 22/22 pass. Native final image reran all 7 E2E tests successfully.
- Benchmark runner uses constant-memory aggregate counters with optional streamed sample JSONL for long runs; its revised runner was checked against a real JVM/frame stream.

- Final amd64 image: all 7 E2E tests passed under CPU emulation (6 CPUs/6 GiB, startup timeout 120s, Java C1). Initial emulation timeout failures are documented in VERIFICATION.md. The native runtime retains default 2 CPU / 3 GiB container limits and 5-instance quota.
