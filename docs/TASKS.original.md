# J2ME Control Center — Master TASKS

> **Mục tiêu:** Xây dựng hệ thống tự host trên Ubuntu/Linux bằng Docker Compose để chạy, quan sát và điều khiển đồng thời nhiều game Java ME (`.jar`/`.jad`) qua web dashboard. Nhắm đến 5 instance đầu tiên, sau đó benchmark và mở rộng 10–100 instance **nếu tài nguyên và độ tương thích cho phép**.
>
> **Trạng thái:** Đây là tài liệu kế hoạch và tiêu chí nghiệm thu, **chưa phải code đã triển khai**. Không đánh dấu hoàn tất trước khi thực sự có code/test.

## 0. Quy ước

- [ ] **P0 / MVP**: cần cho phiên bản chạy được end-to-end.
- [ ] **P1**: nên làm sau MVP.
- [ ] **P2**: tối ưu / nâng cao.
- [ ] Mỗi task chỉ được tick khi đáp ứng **Acceptance criteria** tương ứng và có bằng chứng test.
- [ ] Mặc định game được người vận hành cung cấp hợp pháp; **không** bundle game JAR thương mại.

## 1. Kiến trúc và lựa chọn công nghệ [P0]

- [ ] Chốt kiến trúc mono-repo: `apps/web` (React/Vite), `apps/api` (Node.js/TypeScript/Fastify), `packages/shared` (types/schema), `runtime` (adapter giả lập), `infra` (Docker).
- [ ] Định nghĩa interface `EmulatorAdapter`: `start`, `stop`, `restart`, `sendKey`, `captureFrame`, `getStatus`, `getLogs`, `getMetrics`.
- [ ] Dùng **FreeJ2ME-Plus** (hoặc FreeJ2ME nếu dễ tích hợp hơn) làm backend thử nghiệm, **pin commit/tag** đã kiểm tra tương thích; xác minh entrypoint, Java version và build artifact từ chính repository trước khi viết Dockerfile. Không mặc định tên file jar/build target.
- [ ] Pha đầu: **mỗi instance = một tiến trình JVM + display Xvfb riêng**, không yêu cầu desktop Ubuntu; tách cấu hình và storage.
- [ ] Xác định phương án inject phím/capture màn hình của bản emulator đã chọn; prototype với 1 game mẫu **trước** khi cố định implementation.
- [ ] Có thể thay adapter mà không đổi API/dashboard; lưu game files ở Docker volume.
- [ ] Hệ thống chạy được trên amd64; arm64 là mục tiêu phụ thuộc binary/dependency.

**Acceptance:** một instance chạy JAR mẫu trên Ubuntu headless, nhận phím thật và trả frame thật (không phải ảnh mock).

## 2. Docker và khởi chạy [P0]

- [ ] `docker-compose.yml`: dịch vụ `api`, `web` (hoặc static files từ API), worker/runtime nếu tách riêng; volumes cho games, state, logs.
- [ ] Dockerfile multi-stage cho frontend/backend và runtime Java; cấu hình Java, Xvfb và thư viện cần thiết.
- [ ] `.env.example`: port, credentials, `MAX_INSTANCES`, frame rate mặc định, giới hạn memory/CPU, paths, token expiry.
- [ ] Không expose cổng runtime/Xvfb ra Internet; chỉ expose reverse proxy hoặc HTTP API cần thiết.
- [ ] Healthcheck, restart policies, graceful shutdown và dọn tiến trình con không mồ côi.
- [ ] Hướng dẫn chạy: `docker compose up -d --build`, xem log, nâng cấp, backup và rollback.
- [ ] Quản lý signal PID 1 đúng cách; user không phải root nếu khả thi.
- [ ] Pin image/dependency versions, có `.dockerignore` và log rotation.

**Acceptance:** trên máy Ubuntu mới chỉ cần Docker + Compose và `.env` để dựng; container restart vẫn khôi phục metadata và không để tiến trình mồ côi.

## 3. Quản lý thư viện game [P0]

- [ ] Upload `.jar` và `.jad` qua dashboard/API; nhập đường dẫn file hoặc chọn từ thư viện.
- [ ] Kiểm tra extension, magic/content, ZIP validity, giới hạn file size; chống path traversal, ZIP bomb và file độc hại ở mức khả thi.
- [ ] Parse `META-INF/MANIFEST.MF`: `MIDlet-Name`, `MIDlet-Version`, `MIDlet-Vendor`, `MIDlet-1`, cấu hình yêu cầu.
- [ ] Dò game trùng bằng SHA-256 và lưu metadata: id, name, version, source filename, timestamp.
- [ ] Liệt kê, tìm kiếm, đổi nhãn game và xóa file (cảnh báo nếu đang được dùng).
- [ ] Lưu game file trong volume; không cho nhập filesystem path tùy ý từ UI công khai.
- [ ] Ghi rõ JAD/JAR chỉ hỗ trợ theo emulator; không tự động giả định mọi API Java ME hoạt động.

**Acceptance:** upload hợp lệ sẽ xuất hiện trong danh sách; upload lỗi bị từ chối an toàn, không crash service.

## 4. Vòng đời multi-instance [P0]

- [ ] Tạo instance từ một game, đặt tên, chọn resolution, profile device, FPS cap và heap.
- [ ] `start`, `stop`, `restart`, `delete` cho từng instance.
- [ ] Điều khiển nhiều instance: `start all`, `stop all`, `restart selected` với giới hạn concurrency.
- [ ] Trạng thái rõ ràng: `created`, `starting`, `running`, `stopping`, `stopped`, `failed`.
- [ ] Worker quản lý PID/process group, display number duy nhất, per-instance working directory và log.
- [ ] Health monitor: phát hiện process thoát bất thường, exit code, lý do lỗi; retry có backoff và giới hạn tránh crash loop.
- [ ] Quota: số instance tối đa, RAM/CPU theo instance hoặc toàn hệ thống; từ chối start khi vượt capacity.
- [ ] Khởi động lại sau reboot: policy `manual`, `restore-running` (chạy lại game, **không hứa khôi phục trạng thái in-game**).
- [ ] Có API idempotent và tránh race condition khi spam Start/Stop.

**Acceptance:** chạy ổn định 5 instance độc lập; stop/restart một instance không ảnh hưởng instance khác; có log lỗi cụ thể.

## 5. Điều khiển từ xa [P0]

- [ ] Bàn phím trên web gồm D-pad, OK/Select, Back, Soft Left/Right, `0-9`, `*`, `#`.
- [ ] Mapping keyboard vật lý PC sang keycode phù hợp với emulator; config mapping riêng cho từng game.
- [ ] Hỗ trợ `keydown` và `keyup`, chống kẹt phím khi mất kết nối hoặc mất focus.
- [ ] WebSocket session gửi lệnh theo `instanceId`, có authentication + permission check.
- [ ] Chế độ gửi một lệnh đến nhiều instance được chọn, kèm trạng thái thành công/thất bại từng instance [P1].
- [ ] Điều khiển cảm ứng trên mobile [P1].
- [ ] Macro cơ bản: chuỗi phím + delay, hủy lịch macro, log hoạt động [P2]; không tự xây chức năng né anti-cheat.

**Acceptance:** từ browser bấm phím làm game thay đổi thật; đóng tab sẽ release phím đang nhấn.

## 6. Xem màn hình và streaming [P0]

- [ ] Capture frame từ framebuffer/emulator/Xvfb ở resolution gốc.
- [ ] MVP streaming qua WebSocket với JPEG/WebP (hoặc MJPEG nếu đơn giản hơn); chỉ stream instance đang xem.
- [ ] UI có single-view và grid 2/4/9 màn hình; lựa chọn độ phân giải/quality và FPS gửi.
- [ ] Áp backpressure: drop frames cũ nếu client chậm, không giữ hàng đợi vô hạn.
- [ ] Khi không có viewer, giảm capture rate hoặc dừng capture, **không làm dừng game**.
- [ ] Ghi nhận latency, FPS thực tế, frame drops.
- [ ] Screenshot PNG tải về [P1].
- [ ] Chuyển sang WebRTC hoặc direct framebuffer streaming khi benchmark chứng minh cần [P2].

**Acceptance:** viewer thấy khung hình thật, thao tác từ browser xuất hiện trên stream; không có memory leak do frame queues.

## 7. Dashboard web [P0]

- [ ] Đăng nhập, đăng xuất; giao diện responsive.
- [ ] Overview: tổng/running/stopped/failed; CPU/RAM server; instance đang xem.
- [ ] Bảng instance: game, tên, trạng thái, uptime, PID, CPU, RSS, FPS, nút Start/Stop/Restart/Details.
- [ ] Trang detail: video/frame stream, gamepad, mapping phím, config, metrics, logs.
- [ ] Thư viện JAR/JAD: upload, tìm, chọn game để tạo instance.
- [ ] Bulk selection và cảnh báo khi xóa/stop nhiều máy.
- [ ] Trang Settings: global limits, streaming defaults, paths và diagnostics (chỉ các thiết lập an toàn).
- [ ] Các màn hình loading/empty/error và toast thực tế, không dùng số liệu giả.

**Acceptance:** người mới tự tạo game → tạo instance → start → xem → gửi phím → stop mà không dùng CLI.

## 8. Backend API và persistence [P0]

- [ ] REST endpoints dự kiến:
  - [ ] `GET /api/health`, `GET /api/metrics/summary`
  - [ ] `GET/POST /api/games`, `GET/DELETE /api/games/:id`, `POST /api/games/upload`
  - [ ] `GET/POST /api/instances`, `GET/PATCH/DELETE /api/instances/:id`
  - [ ] `POST /api/instances/:id/start|stop|restart`
  - [ ] `GET /api/instances/:id/logs|metrics|screenshot`
  - [ ] `POST /api/instances/bulk` (P1)
  - [ ] `GET/POST /api/auth/*`
- [ ] WebSocket `/ws`: auth handshake; subscribe frames, state, metrics/logs; send key up/down.
- [ ] Schema validation (Zod), consistent errors, request IDs và OpenAPI.
- [ ] SQLite WAL cho MVP với volume persistent: `games`, `instances`, `settings`, `events`, `users`, `sessions`.
- [ ] Migration có phiên bản, transactional updates và backup database.
- [ ] Process manager reconcile DB state với process đang chạy khi API khởi động.

**Acceptance:** API không mất metadata sau restart; client nhận state events đáng tin cậy.

## 9. Bảo mật & cô lập [P0]

- [ ] Mặc định **chỉ dùng qua localhost/Tailscale/VPN**, nếu public Internet bắt buộc HTTPS + auth mạnh.
- [ ] Admin account khởi tạo từ environment/one-time setup; mật khẩu hash bằng Argon2id hoặc bcrypt phù hợp.
- [ ] HttpOnly/SameSite cookie hoặc token an toàn; chống CSRF nếu dùng cookie và rate-limit login/API.
- [ ] Validate mọi upload và parameter; không shell-concatenate user input, không cho user tùy ý thực thi command.
- [ ] Chạy emulator bằng user không root và giới hạn network/filesystem/resources.
- [ ] Cô lập game JAR **không đáng tin cậy**: cân nhắc tách từng JVM trong container/sandbox với filesystem read-only, resource caps và hạn chế outbound network [P1; nên làm sớm nếu nhiều user].
- [ ] Không mount Docker socket vào web/API; không cấp `--privileged`.
- [ ] Secret không commit lên Git; audit log hành động quản trị [P1].
- [ ] Làm rõ sandbox của JVM/Xvfb **không tự động đảm bảo an toàn** trước game độc hại.

**Acceptance:** truy cập không auth bị từ chối; không thể dùng endpoint để đọc file server hay chạy lệnh shell.

## 10. Log, metrics và tối ưu [P0/P1]

- [ ] Ghi stdout/stderr riêng instance với rotate và retention.
- [ ] Thu CPU%, RSS/PSS, heap nếu có, uptime, frame FPS, stream bitrate, websocket clients.
- [ ] Dashboard hiển thị resource usage theo instance và tổng.
- [ ] FPS cap và stream cap độc lập nhau; tắt audio nếu game hoạt động bình thường mà không cần audio.
- [ ] Cấu hình JVM heap phù hợp game; nhớ `-Xmx` chỉ giới hạn heap, **không giới hạn tổng RSS**.
- [ ] Benchmark 1, 5, 10, 20 instance cùng một game, sau đó thử các game khác nhau; ghi CPU, RAM, stability, latency.
- [ ] Không cam kết 50–100 instance trước khi có benchmark; bổ sung admission control dựa trên kết quả đo.
- [ ] Về sau fork engine để nhận key và framebuffer trực tiếp, bỏ Xvfb nếu đem lại lợi ích đo được [P2].

**Acceptance:** có bảng benchmark có máy test, game test, FPS và resource thực đo; baseline để so cải tiến.

## 11. Compatibility, storage và network [P1]

- [ ] Device profiles thường gặp: màn hình 176×208, 240×320, 320×240, 360×640 (chỉ khi emulator/game hỗ trợ).
- [ ] Kiểm tra MIDP 1/2, CLDC, RMS persistence, sound, Nokia/vendor APIs và M3G theo từng game.
- [ ] Tách save/RMS và cấu hình cho mỗi instance, kể cả khi cùng một JAR.
- [ ] Xuất/nhập save và backup toàn volume; versioning migration nếu format thay đổi.
- [ ] Game online: kiểm tra TCP/UDP/HTTP/socket permissions và DNS; hỗ trợ cấu hình proxy/DNS nếu thực sự cần.
- [ ] Không mặc định có thể đổi endpoint server game qua config; nhiều game cần patch JAR hoặc server gốc đã offline.
- [ ] Chỉ thao tác với máy chủ/game có quyền sử dụng; không triển khai bypass anti-cheat hoặc truy cập trái phép.

**Acceptance:** test ít nhất một game offline và (nếu có) một game online hợp lệ; đóng/mở instance không trộn save của hai máy.

## 12. Multi-user / Scale-out [P2]

- [ ] RBAC: admin/operator/viewer, ownership theo instance.
- [ ] Multi-node workers: API coordinator + worker registration/heartbeat, queue, scheduler và capacity reporting.
- [ ] Game file store dùng object storage/shared volume, state và logs tập trung.
- [ ] Streaming gateway route viewers đến worker tương ứng; TLS và access control.
- [ ] Rate limits theo user, quota theo namespace và audit log đầy đủ.
- [ ] Autoscaling chỉ khi có bằng chứng workloads có lợi; phân biệt instance game chạy liên tục với job tạm thời.

## 13. Testing và CI/CD [P0/P1]

- [ ] Unit tests: schema, state machine, process manager, key mapping, quotas.
- [ ] Integration tests: upload, start/stop/restart, failure/reconcile, auth, WebSocket.
- [ ] E2E Playwright: login → upload → create → start → view → keypress → stop (dùng game test hợp pháp).
- [ ] Test crash/restart container, zombie cleanup, lỗi upload, malformed JAD/JAR, reconnect WebSocket.
- [ ] Performance soak test 24h với 5 instance, kiểm tra memory leaks và log growth [P1].
- [ ] GitHub Actions lint, typecheck, tests, Docker build + vulnerability scan [P1].
- [ ] Không bundle ROM/JAR không được cấp quyền trong CI hoặc public repo.

## 14. Deliverables và README [P0]

- [ ] Source code đầy đủ và license riêng; tuân thủ license emulator/third-party dependencies.
- [ ] `docker-compose.yml`, Dockerfiles, `.env.example`.
- [ ] `README.md`: yêu cầu máy, cài nhanh, URL, tài khoản initial setup, upload game, cách vận hành.
- [ ] `docs/ARCHITECTURE.md`: sơ đồ modules/processes, đường đi frame/input/state.
- [ ] `docs/API.md` hoặc OpenAPI auto-generated.
- [ ] `docs/TROUBLESHOOTING.md`: không hiện màn hình, game không start, audio, JAR không tương thích, cạn RAM, cổng bị trùng.
- [ ] `scripts/backup.sh`, `scripts/restore.sh`, ví dụ compose cho VPS sau reverse proxy.
- [ ] `docs/BENCHMARKS.md` với kết quả thật (không ghi số ước lượng như đã đo).

## 15. Thứ tự triển khai đề xuất (milestones)

### M0 — Feasibility spike (ưu tiên đầu tiên)
- [ ] Xác minh repo/commit và license emulator, thử build trong container.
- [ ] Chạy 1 game JAR headless, capture được 1 frame và gửi được 1 phím.
- [ ] Kiểm tra RMS/save riêng và stdout/errors.
- [ ] **Gate:** nếu không đạt, đổi emulator adapter trước khi làm UI.

### M1 — MVP usable
- [ ] Docker Compose + API + SQLite + upload game.
- [ ] Quản lý 5 instance start/stop/restart.
- [ ] Web dashboard + live stream từng game + keyboard/gamepad.
- [ ] Auth admin, metrics cơ bản, README.
- [ ] **Gate:** E2E chạy từ Ubuntu VPS mới không cần desktop.

### M2 — Harden & operate
- [ ] Bulk controls, save backup/restore, responsive UI.
- [ ] Crash recovery, monitoring, resource quotas và bảo mật upload/sandbox.
- [ ] Soak test 24h; benchmark 10–20 instance.

### M3 — Performance & scale
- [ ] Direct framebuffer/input adapter để giảm overhead nếu benchmark cần.
- [ ] Multi-worker/multi-host scheduler và remote streaming optimization.
- [ ] Benchmark thực tế mục tiêu 50–100 instance; chỉ claim khi đo được.

## 16. Các quyết định còn mở (giữ configurable, không chặn MVP)

- [ ] Emulator cụ thể/commit và license cho bản phân phối Docker.
- [ ] Một JVM mỗi instance hay core multi-instance tùy kết quả benchmark.
- [ ] Mục tiêu chủ yếu game 2D hay 3D; online/offline; API vendor đặc biệt.
- [ ] Chỉ 1 admin hay nhiều user; LAN/VPN hay public Internet.
- [ ] Số lượng instance và cấu hình VPS thực tế sau benchmark.
- [ ] Chính sách persistence khi VPS reboot: restart process hay khôi phục in-game (khác nhau).

---

### Definition of Done — MVP

- [ ] `docker compose up -d --build` thành công trên Ubuntu x86_64.
- [ ] Đăng nhập dashboard và upload game JAR hợp lệ.
- [ ] Tạo, start đồng thời 5 instance và hiển thị trạng thái thật.
- [ ] Xem live frame và điều khiển được game bằng phím từ browser.
- [ ] Stop/restart một instance độc lập, log và resource metrics hiển thị đúng.
- [ ] Container restart không mất danh sách game/instance và không có JVM mồ côi.
- [ ] Có test và README tái hiện cách triển khai, nêu rõ giới hạn game support.
