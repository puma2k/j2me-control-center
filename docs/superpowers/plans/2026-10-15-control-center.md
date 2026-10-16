# J2ME Control Center implementation plan

Goal: deliver the supplied game control center with real emulator execution and reproducible Docker deployment.
Architecture: Fastify + React SPA + SQLite WAL + interchangeable process adapter; direct FreeJ2ME framebuffer/input bridge, private Xvfb per JVM.
Spec: ../specs/2026-10-15-control-center-design.md
Execution: native, autonomous as requested by user.

## Constraints and review focus
No bundled commercial games, no arbitrary filesystem paths or shell commands, no fabricated metrics. Test hostile ZIP/JAD entries, concurrency/quota races, disconnected held keys, child crashes, persistence/reconcile. Default localhost, non-root runtime. Do not claim hostile game sandboxing.

- [x] 1. Feasibility: pin/build emulator, compile original fixture, real frame/input/RMS smoke inside Linux container.
- [x] 2. Core tests first: upload validation, schema and SQLite persistence; implement shared schema/library/store.
- [x] 3. Lifecycle tests first: five instances, races/quota, failure cleanup; implement process adapter and manager.
- [x] 4. API integration tests first: auth/CSRF/upload/lifecycle/WS; implement REST + WS with bounded frame queues.
- [x] 5. React dashboard: library, overview, grid/detail/gamepad, settings, real metrics/logs; Playwright E2E.
- [x] 6. Ops: Docker/Compose, backup/restore, CI, docs, benchmark/soak runner; run checks and independent review; fix material findings.

Verification commands: npm test; npm run typecheck; npm run build; docker compose build; docker compose up -d; npm run test:e2e. Record actual results and exclusions in docs/VERIFICATION.md and docs/BENCHMARKS.md.
