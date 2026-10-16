# Verification evidence

Implementation date: 2026-10-15 (Asia/Ho_Chi_Minh). Workspace initially empty. Original task document is in TASKS.original.md. This record lists actual checks; no future-roadmap checkbox is silently marked complete.

| Check | Result |
|---|---|
| Emulator source/build | FreeJ2ME-Plus pinned baca76a4dda6f30abac67fb4a3db009eed05f91c; build.xml verified; Java8/Ant compiled real standalone artifact |
| Feasibility spike | Real 240×320 PNG, TEST_KEY -5 / TEST_RELEASE -5, visible Keys 1 / RMS boots 1; screenshot visually inspected |
| `npm run lint` | Passed Prettier check |
| `npm run typecheck` | Passed TypeScript strict check |
| `npm test` | 22 passed, zero failures or skipped tests when legal compiled fixture present |
| `npm run build` | Passed Vite and server TypeScript production build |
| `npm audit --audit-level=high` | Zero vulnerabilities reported in installed lockfile |
| Docker native image / Compose | Built and healthy, UID1000, read-only root, no capabilities, private Xvfb, localhost HTTP only |
| Browser/integration E2E on Linux arm64 | 7 passed on final native release; [raw log](evidence/e2e-arm64.log) |
| Browser/integration E2E on Linux amd64 image | 7 passed under x86 CPU emulation on Apple M1; [raw log](evidence/e2e-amd64.log); validation caps 6 CPUs/6 GiB, startup 120s, Java C1 (`JAVA_TOOL_OPTIONS=-XX:TieredStopAtLevel=1`) |
| Unexpected JVM SIGKILL | Detected failure, cleaned companion processes, automatic bounded retry produced a new PID |
| Container restart | Persisted library/instances; restore-running resumed, manual remained stopped; exactly one JVM, no orphan game JVM |
| All-volume backup/restore | Actual uploaded game + metadata + RMS backup; deleted instance/renamed metadata; restore recovered original metadata and save bytes |
| Performance smoke | 1, 5, 10, 20 JVMs measured; [raw data and limits](BENCHMARKS.md) |

The seven E2E tests cover desktop login/upload/create/start/real image/input/stop, mobile overflow, five independent JVMs and quota, screenshot/input isolation and held-key disconnect release, anonymous/wrong-origin WS rejection, idle logout revocation, real JAD property loading, save import/export lock, and actual cancellable key macros. Regression tests also cover deletion/create race, reduced environment caps, password rotation, corrupt ZIP CRC, unsafe JAD, concurrent input owners, runtime replacement, save traversal/symlinks/large base64/Unicode.

Recovery raw evidence: [recovery.json](evidence/recovery.json). Real UI screenshots: [instance detail](screenshots/instance-detail.png), [mobile library](screenshots/mobile-library.png).

Independent review was performed twice for material issues. All important findings were fixed with regression verification. The JAD support concern was withdrawn after checking the pinned loader and a real property-read E2E. See EXECUTION.md for design rulings and fixes.

Not certified: a fresh remote Ubuntu host install, public HTTPS/domain setup, GitHub-hosted CI/Trivy execution, 24h soak, online game compatibility, hostile JAR isolation, multi-user/multi-node scale, or 50–100 instance performance. These are recorded explicitly in STATUS.md.

The amd64 suite initially hit startup/UI timeouts under CPU emulation. The runtime now exposes bounded startup timeout configuration; test harness start deadlines are configurable and UI resources are cleaned on failure. Final emulated amd64 run passed all seven tests in 3.7 minutes. This establishes functional compatibility of the amd64 image, not native amd64 throughput or a fresh remote Ubuntu host certification. Native arm64 final run passed all seven in 19.8 seconds.

## Laptop and mobile text input follow-up

The text input path adds a native browser input (mobile virtual keyboard / laptop / paste / IME), password masking, explicit per-instance sending and backspace. Test coverage includes Canvas character codes without Q/W shortcut remapping, TextBox and focused Form TextField UTF-8 text/backspace, Form ItemStateListener notifications, mobile viewport use, and physical arrow hold across the 3-second status refresh. Input is not broadcast to other selected instances. Final follow-up: 25 unit tests and all 7 native arm64 E2E tests passed (40.6 seconds); strict typecheck, lint and Docker production build passed. The new native arm64 results are recorded in `evidence/e2e-text-input.log`; no physical iOS/Android device test or updated amd64 run is claimed.

Direct-entry follow-up: click-to-focus game input forwards laptop keys immediately without a submit step. The same native text input calls mobile keyboards from the keyboard button. Direct Unicode typing and Backspace in native TextBox/Form are exercised at a 390-pixel viewport, plus Canvas Q/W characters and held physical arrows. Raw log: `evidence/e2e-direct-input.log`.

Enter follow-up: native TextBox/Form confirmation now invokes the highest-priority Command.OK on the LCDUI queue; it does not insert the emulator's currently selected character. The fixture has three commands (Cancel, Help, Done) so Enter must select Done rather than opening Options or selecting Cancel. Direct typing is the default on desktop and printable keys outside other browser fields also forward to the current game. Evidence: `evidence/e2e-enter.log`.

TCP networking follow-up: pinned upstream Connector routed socket URLs to an HTTP stub returning null streams. The build now overlays a real JSR-118 SocketConnection using java.net.Socket. Docker build runs a real loopback TCP echo test through Connector.open, DataInput/OutputStreams, socket options, READ mode, malformed URL rejection and repeated close. HTTP/HTTPS APIs remain upstream stubs; no general HTTP support is claimed.

Actual supplied NRO246_x6 runtime after TCP fix: log reports `connect 1 ok` and `getKey true`, with green Vũ trụ 3 server status on the game menu. This verifies the game handshake, not completed gameplay/login. All 7 native E2E tests passed (43.6s); the final forced clean emulator rebuild independently passed NETWORK_TEST_PASS.


Low-resource follow-up: 26 unit tests and all 7 native arm64 E2E tests passed (43.8 seconds), along with strict typecheck, lint and Docker production build. New encoder tests verify real RGB-to-JPEG output, sharing, expiry and quality separation. Existing native PNG screenshots, direct keyboard input, pointer events, independent JVMs, quotas and WebSocket authorization remain covered. Logs: evidence/unit-light.log and evidence/e2e-light.log. Actual NRO at 128 MiB heap reached its online character screen; this is a short functional check, not a soak test.


Measured-memory follow-up: 26 unit tests, strict typecheck, Prettier and the production Docker build passed. All 7 native browser/integration tests passed (49.0 seconds) after stopping the existing NRO instance; a prior attempt's five-JVM quota test was blocked by that extra running instance. Final log: evidence/e2e-memory.log. The supplied NRO was then restarted at 128 MiB maximum heap and 60 game/stream FPS, its online server menu visually verified, and read-only heap/RSS plus received-frame measurements recorded. No account submission or prolonged map gameplay is part of this measurement.


Idle-screen follow-up: 27 unit tests, strict typecheck, lint and Docker production build passed. All 8 native E2E tests passed (53.0 seconds). The new test advances browser time through the 30-second inactivity boundary, checks an empty WebSocket subscription and no continuing frame stream, verifies unchanged game PID/running state/60 FPS setting, and checks keyboard and pointer wake without forwarding the wake gesture. Subsequent direct typing reaches the fixture. Unit tests cover inactivity reset, held controls, releasing on blur without waking an already sleeping screen, and timer disposal. Final logs: evidence/unit-idle.log and evidence/e2e-idle.log. An early probe exposed child-input blur waking the screen during unmount; the blur handler now reacts only to the window itself.

Final visual follow-up: the idle E2E additionally verifies the sleep surface remains black under pointer hover and passed independently (6.3 seconds). The actual NRO browser was observed entering sleep after 30 seconds of real inactivity; screenshot: screenshots/idle-screen.png. The final CSS-only correction does not change runtime behavior or resource measurements.
