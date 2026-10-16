# Implementation status against supplied roadmap

This file separates implemented software from deployment/long-run acceptance. The original task document is preserved unmodified at TASKS.original.md. Exact verification records are in VERIFICATION.md; measured performance is in BENCHMARKS.md.

## Implemented

- Low-resource stream path: reusable RGB framebuffer in tmpfs, one JPEG encode, short shared per-runtime cache, direct image updates without full-app frame rerenders, and hidden-tab subscription pause. Serial GC and 8 MiB initial heap; default game20/stream8 FPS with JPEG60. Native PNG screenshots remain available.

- Laptop/mobile browser text composer with password masking, paste/IME, single-instance Unicode input and backspace; native TextBox/Form field editing and Canvas character events.

- Monorepo React/Vite + Fastify/TypeScript + shared Zod types; emulator adapter interface.
- Pinned FreeJ2ME-Plus source/build, one real JVM + Xvfb per instance, direct framebuffer/input bridge, native-resolution PNG and JPEG streaming.
- Docker multi-stage images, init/signal handling, non-root/read-only runtime, healthcheck/restart, persistent games/state/SQLite volumes, total CPU/RAM/PID caps, log rotation.
- Secure JAR/JAD upload, full ZIP validation/CRC/expansion bounds, manifest metadata, SHA-256 dedup, library search/relabel/delete and matching sidecar descriptors.
- Lifecycle create/config/start/stop/restart/delete, bulk controls with per-ID results, serialized quota admission, crash detection and bounded retries, reboot policy, reconcile.
- Auth with bcrypt, opaque hashed sessions, HttpOnly/SameSite cookies, Origin/CSRF checks, API/login/WS limits, WS expiry/revocation, authenticated metrics/logs/API.
- Desktop/mobile responsive dashboard, empty/error states, real metrics, logs, grid 1/2/4/9, touch/physical gamepad, per-instance mappings and multi-target keys.
- Key ownership across concurrent viewers, disconnect/blur release, runtime generation reset. Bounded cancellable macros with audit events.
- Viewer-only capture, shared in-flight frames, backpressure/drop policy, bounded client images, independent game/stream FPS, real stream counters and screenshot downloads.
- Isolated RMS/config storage, staged save import/export, all-volume consistent backup/restore and rollback guidance.
- Unit/integration/real-emulator/browser tests, original legal test MIDlet, CI lint/typecheck/test/build/audit/E2E configuration, benchmark and 24h soak runners, operation/API/compatibility documentation.

## Not claimed complete

- 24-hour five-instance soak: runner exists; a completed 24-hour result is not supplied by this short implementation session.
- Broad compatibility: no licensed online game/server or independent commercial games supplied; vendor APIs/M3G/audio/network compatibility not certified. Only original offline test game is verified.
- Per-JVM hostile-code sandbox and per-instance hard CPU/RSS quotas: current cgroup caps are shared. Trusted single-admin use only.
- Multi-user RBAC/ownership and multi-node workers/coordinator/object store/stream gateway/autoscaling: not implemented. These are the roadmap's P2 scale-out subsystem, not a claim made by this deployment.
- WebRTC transport: not implemented; direct framebuffer/JPEG path already avoids desktop screenshot overhead. Further transport changes need benchmark evidence.
- 50–100 instance capacity: not claimed. The documented short benchmark is a baseline, not a long-run guarantee.
- Public VPS/HTTPS deployment and GitHub-hosted CI execution: configuration provided, but no external domain/VPS/GitHub repository was supplied. They were not published or run remotely.

The software is an operational single-host MVP plus selected P1/P2 functionality. It is not the full multi-tenant distributed product described in every future-roadmap checkbox.

Idle-screen follow-up: 30 seconds without user activity unsubscribes this browser from frame streams and displays a black wake screen. Game JVM, network and configured FPS continue. Keyboard/pointer holds defer sleeping; the first key or touch wakes without forwarding a game command. Other viewers retain their own independent subscriptions.
