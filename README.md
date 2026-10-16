# J2ME Control Center

Dashboard tự host để upload, chạy và điều khiển nhiều game Java ME trên Linux headless. React/Vite + Fastify/TypeScript + SQLite WAL. Mỗi instance có JVM, Xvfb, cấu hình và RMS riêng. Frame/input đi trực tiếp qua core FreeJ2ME-Plus; không dùng ảnh hay metrics giả.

## Khởi chạy

Cần Docker Engine + Compose v2. Mục tiêu Ubuntu x86_64; Linux arm64 cũng được kiểm thử qua Docker Desktop. Khởi đầu nên dành 2 CPU, 3 GB RAM cho container và thêm tài nguyên cho host. Sức chứa thực tế phụ thuộc game.

```sh
cp .env.example .env
# Đặt ADMIN_PASSWORD duy nhất, ít nhất 12 ký tự.
docker compose up -d --build
docker compose logs -f api
```

Mở [dashboard](http://127.0.0.1:3000), đăng nhập bằng `ADMIN_USERNAME` / `ADMIN_PASSWORD` trong `.env`. Không có tài khoản/mật khẩu mặc định được hardcode. Trong workspace đã chuẩn bị, `.env` có mật khẩu ngẫu nhiên và quyền 0600; không commit file này.

1. Thư viện game → chọn JAR hợp lệ (tối đa 32 MiB).
2. Nếu cần JAD: đính kèm JAD trên thẻ game tương ứng. JAD phải trỏ đến tên JAR local; không tự tải URL bên ngoài.
3. Tạo instance → đặt tên, resolution, profile, heap/FPS.
4. Start → bấm tên instance → xem frame và gamepad, hoặc chọn nhiều instance rồi mở Live screens.
5. Mặc định gõ chữ trực tiếp bằng bàn phím laptop. Chạm màn hình game hoặc nút “⌨ Nhập trực tiếp” trên điện thoại để mở bàn phím hệ thống. Mũi tên di chuyển, Enter xác nhận (kết thúc ô nhập chuẩn Java ME hoặc chọn trong game), Backspace xóa; bấm/kéo màn hình để cảm ứng. Gamepad và dán đoạn chữ là tùy chọn.
6. Stop/Restart từng instance hoặc dùng bulk controls. Xóa instance sẽ xóa save riêng, cần xác nhận trên UI.

Game tiếp tục chạy khi không có viewer, nhưng không capture frame. Screenshot PNG tải trực tiếp từ detail. Chọn grid 1/2/4/9; client chậm bị drop frame thay vì tạo queue vô hạn. Game FPS và stream FPS độc lập. `START_TIMEOUT_SECONDS` (mặc định 60, tối đa 300) cho phép điều chỉnh thời gian khởi động trên host chậm.

## Game test hợp pháp

Image tự biên dịch MIDlet gốc từ `tests/fixture/ControlTest.java` (MIT). Không kèm game thương mại. Xuất fixture để upload:

```sh
mkdir -p .cache
docker compose cp api:/opt/fixtures/control-test.jar .cache/control-test.jar
```

Game test đổi màu/đếm phím thật, ghi `TEST_KEY`/`TEST_RELEASE` và có bộ đếm số lần mở lưu qua RMS. FreeJ2ME-Plus pin commit `baca76a4dda6f30abac67fb4a3db009eed05f91c`, Java 8 runtime. Source, giấy phép và bridge được giữ trong image tại `/emulator` và `/emulator/bridge`.

Ảnh chụp dashboard thực tế: [Overview](docs/screenshots/overview.png), [Instance detail](docs/screenshots/instance-detail.png).

## Vận hành

```sh
docker compose ps
docker compose logs --tail=100 api
docker compose restart api
scripts/backup.sh                 # tạm dừng để backup consistent cả 3 volumes
scripts/restore.sh /path/control-center.tar.gz  # ghi đè dữ liệu; backup trước!
```

Các script vận hành cần Bash; script restore dùng Python 3 để kiểm tra archive.

Không dùng `docker compose down -v` nếu cần giữ dữ liệu. Policy `restore-running` chạy lại game sau restart; không khôi phục RAM/state in-game. RMS lưu riêng vẫn tồn tại. Đổi mật khẩu environment rồi recreate container sẽ thu hồi các session cũ.

Nâng cấp: backup, giữ image cũ bằng `docker tag j2me-control-center:local j2me-control-center:previous`, cập nhật source, `docker compose up -d --build`. Rollback: dừng service, phục hồi backup tương ứng nếu schema thay đổi, tag image previous trở lại local rồi `docker compose up -d --no-build`. Không mở DB mới hơn bằng bản server cũ.

Giới hạn RAM admission dành heap + 128 MB overhead mỗi JVM. Đây là ước lượng admission, không phải cap RSS từng JVM. `mem_limit`, `cpus`, `pids_limit` giới hạn toàn container. RAM/CPU hiển thị là đo thực qua `/proc`; host memory/load là của Linux VM trên Docker Desktop. Chỉ nâng quota sau benchmark.

## Bảo mật và phạm vi hỗ trợ

Mặc định chỉ bind localhost; truy cập từ xa bằng VPN/Tailscale hoặc SSH tunnel. Nếu public Internet: dùng reverse proxy HTTPS, `COOKIE_SECURE=true`, `PUBLIC_ORIGIN=https://your-host`, mật khẩu mạnh; xem `infra/compose.proxy.yml`. Không expose Xvfb, không mount Docker socket, container non-root/read-only/no-new-privileges/cap_drop ALL.

Chỉ chạy JAR đáng tin cậy do người vận hành có quyền sử dụng. JVM và Xvfb cùng container **không phải sandbox an toàn cho game độc hại**; game có thể dùng quyền filesystem/network của user runtime. Multi-tenant không phù hợp với adapter cùng container này. Việc tách game vào sandbox/container riêng, RBAC và worker đa máy là phần mở rộng chưa được nghiệm thu.

Không đảm bảo mọi MIDP/CLDC/vendor API/M3G/audio/online game đều hoạt động. Âm thanh bị tắt ở bridge. Không patch endpoint, bypass anti-cheat hay bundle game không có quyền. Có matrix tương thích tại [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md).

## Phát triển và test

Cần Node **24 LTS**, npm và Docker cho emulator.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
# sau khi Compose chạy và đã xuất fixture:
npm run test:e2e
BENCH_COUNTS=1,5 BENCH_SECONDS=30 npm run benchmark
# 24h soak, để chạy riêng; không chạy trùng với E2E/benchmark:
scripts/soak.sh
```

Backend dev: `ADMIN_PASSWORD=... npm run dev`; UI: `npm run dev:web`. Emulator runtime cần Linux, Java 8 và Xvfb (khuyến nghị Compose). REST được ghi trong [docs/API.md](docs/API.md); Swagger tại `/docs` yêu cầu đăng nhập.

Xem [kiến trúc](docs/ARCHITECTURE.md), [xử lý lỗi](docs/TROUBLESHOOTING.md), [benchmark](docs/BENCHMARKS.md), [bằng chứng kiểm thử](docs/VERIFICATION.md), và [phạm vi còn lại](docs/STATUS.md). Checklist gốc giữ nguyên trong `docs/TASKS.original.md` để không biến yêu cầu thành claim hoàn thành.

Nhập trực tiếp: chạm màn hình game rồi gõ bằng bàn phím laptop; trên điện thoại dùng nút “⌨ Nhập trực tiếp” để mở bàn phím hệ thống. Chữ được gửi ngay, không cần nút gửi. Backspace xóa, Enter = OK, mũi tên điều hướng, Escape ẩn bàn phím. Q/W trong chế độ nhập là chữ. Mục “Dán đoạn chữ (tùy chọn)” giữ công cụ gửi đoạn chữ khi cần.

Mạng TCP Java ME: bản build có lớp SocketConnection thật thay cho stub upstream, hỗ trợ socket://host:port, stream dữ liệu và socket options. HTTP/HTTPS của lõi upstream chưa được triển khai; kết nối tới từng game server vẫn cần kiểm tra thực tế.

Cấu hình nhẹ hiện tại: game mặc định 20 FPS, luồng màn hình 8 FPS/JPEG60, NRO heap tối đa128 MB. JVM dùng Serial GC và heap khởi tạo8 MB. Luồng xem lấy RGB từ tmpfs rồi mã hóa JPEG một lần, chia sẻ ảnh giữa người xem cùng chất lượng; tab ẩn ngừng nhận ảnh nhưng game vẫn chạy. Ảnh chụp tải xuống giữ PNG nguyên độ phân giải. Giới hạn3 GiB của container là trần, không phải RAM luôn chiếm.

Cập nhật theo yêu cầu: FPS mặc định của game và luồng màn hình là 60. Preset 20/8 FPS trước đó đã được thay thế; các tối ưu RAM và xử lý ảnh vẫn giữ nguyên. FPS thực nhận phụ thuộc tải và khả năng của game.

Đo bộ nhớ giả lập: chạy `scripts/profile-memory.sh` khi game đang chạy. Báo cáo tách heap đang dùng, heap đã cấp phát và RSS/PSS của JVM. Bản tối ưu dùng C1 JIT, giới hạn arena của glibc và giảm heap trống giữ lại sau GC; trần heap vẫn 128 MiB để chừa chỗ cho tài nguyên game. Game/stream vẫn đặt 60 FPS. C1 có thể đổi mức dùng CPU ở cảnh phức tạp; kết quả menu không thay thế phép đo chơi lâu.

Chế độ nghỉ màn hình: sau 30 giây không thao tác trong trang đang xem game, màn hình chuyển đen và client hủy đăng ký luồng ảnh. Không có người xem khác thì server ngừng chụp/nén/truyền ảnh; game vẫn chạy với cấu hình FPS và kết nối mạng giữ nguyên. Giữ phím hoặc giữ chạm không kích hoạt nghỉ. Chạm hoặc bấm phím lần đầu chỉ đánh thức màn hình; thao tác tiếp theo điều khiển game như bình thường. Mỗi trình duyệt có trạng thái nghỉ riêng; nếu trình duyệt khác vẫn xem cùng game, server vẫn cần tạo ảnh cho người đó.
