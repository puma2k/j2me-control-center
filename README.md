<div align="center">

# J2ME Control Center

### Java ME games. One dashboard. Your infrastructure.

Run, monitor and control multiple J2ME games from your browser — on your laptop or phone.

[![CI](https://github.com/puma2k/j2me-control-center/actions/workflows/ci.yml/badge.svg)](https://github.com/puma2k/j2me-control-center/actions/workflows/ci.yml)
![Node.js 24](https://img.shields.io/badge/Node.js-24_LTS-339933?logo=nodedotjs&logoColor=white)
![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Java ME](https://img.shields.io/badge/Java-ME-F89820)

[Quick start](#quick-start) · [Features](#features) · [Performance](#performance) · [Documentation](#documentation)

</div>

![J2ME Control Center dashboard](docs/screenshots/overview.png)

## From JAR to playable screen

J2ME Control Center is a self-hosted dashboard for Java ME games on headless Linux. Upload a JAR, create an instance, and interact through a live screen, keyboard or touch controls. Each instance gets its own JVM, Xvfb display, configuration and RMS save data.

Built with **React + Vite**, **Fastify + TypeScript**, **SQLite WAL** and **FreeJ2ME-Plus**. Frames come directly from the emulator framebuffer. CPU and memory metrics come from real processes.

The interface is in **English**. Game content follows the language provided by the game itself. Older screenshots may show the previous Vietnamese interface.

## Features

|                          | What you get                                                                |
| :----------------------- | :-------------------------------------------------------------------------- |
| **Game library**         | Upload JARs, attach JAD metadata, and reuse games across instances.         |
| **Instance management**  | Start, stop, restart, bulk actions and per-game runtime logs.               |
| **Live screens**         | Watch 1 / 2 / 4 / 9 screens with adjustable stream FPS and JPEG quality.    |
| **Direct typing**        | Laptop keyboards, mobile keyboards, pasted text, Unicode and IME input.     |
| **Game controls**        | Arrow keys, Enter, Backspace, on-screen gamepad, touch and drag.            |
| **Persistent saves**     | Separate RMS data per instance, save import/export and volume backups.      |
| **TCP networking**       | Real `socket://` connections through a SocketConnection implementation.     |
| **Idle-aware streaming** | Stop streaming after 30 seconds of inactivity while the game keeps running. |
| **Resource monitoring**  | PID, uptime, CPU, RSS/PSS and stream statistics.                            |
| **API access**           | Authenticated REST, WebSocket and Swagger documentation at `/docs`.         |

### Play when you want. Save resources when you step away.

Game and stream targets default to **60 FPS**. After 30 seconds without user activity, the screen turns black and the browser unsubscribes from frames. With no other active viewers, the server stops capturing, encoding and transmitting images. The game JVM, network connection and configured game FPS stay unchanged.

The first tap or key press wakes the screen without sending an accidental game action. Your next input controls the game normally. Held keys and touches postpone sleep. Hidden tabs also unsubscribe. Each browser manages its own idle state.

<details>
<summary><strong>See the instance controls</strong></summary>

![Instance controls](docs/screenshots/instance-detail.png)

This screenshot is from an earlier verification run. Current defaults are 60 FPS and an English interface.

</details>

## Quick start

You need **Docker Engine + Compose v2**. The emulator runtime requires Linux. The image has been tested on Linux arm64 and linux/amd64 through Docker Desktop; actual capacity depends on the game and host CPU.

```sh
git clone https://github.com/puma2k/j2me-control-center.git
cd j2me-control-center
cp .env.example .env
```

Edit `.env` and set a unique `ADMIN_PASSWORD` with at least 12 characters. Then start the service:

```sh
docker compose up -d --build
```

Open **[localhost:3000](http://127.0.0.1:3000)** and sign in with your configured `ADMIN_USERNAME` and `ADMIN_PASSWORD`.

1. Open **Game library** and upload a JAR you have permission to use, up to 32 MiB.
2. Attach a JAD if needed. JAD files must reference a local JAR filename; remote game downloads are not performed.
3. Choose **Create instance**, select the game and configure it.
4. Click **Start**, open the instance, and tap the screen to type or control it.
5. Select multiple instances and open **Live screens** to watch them together.

### Key settings

| Setting            | Default   | Purpose                                                            |
| :----------------- | :-------- | :----------------------------------------------------------------- |
| Game FPS           | `60`      | Per-instance target; actual FPS depends on the game and host load. |
| `STREAM_FPS`       | `60`      | Stream target, independent of game FPS.                            |
| `STREAM_QUALITY`   | `60`      | JPEG quality for live frames.                                      |
| Per-instance heap  | `128 MiB` | Maximum Java heap, not the JVM's total memory usage.               |
| `MAX_INSTANCES`    | `5`       | Concurrent running-game quota.                                     |
| `MEMORY_BUDGET_MB` | `2048`    | Estimated admission memory budget.                                 |
| `CONTAINER_MEMORY` | `3g`      | Whole-container memory limit, not permanently allocated RAM.       |
| `CONTAINER_CPUS`   | `2.0`     | Shared CPU limit for the application container.                    |

See [`.env.example`](.env.example) for all environment settings. Keep `.env` out of Git and replace the example password before deployment.

## Controls

| Action            | Input                                                                 |
| :---------------- | :-------------------------------------------------------------------- |
| Type text         | Tap the game screen and type; on mobile, open the on-screen keyboard. |
| Move              | Arrow keys or the gamepad.                                            |
| Confirm           | `Enter` / OK.                                                         |
| Delete text       | `Backspace`.                                                          |
| Hide the keyboard | `Escape` or the hide-keyboard button.                                 |
| Touch interaction | Tap, hold and drag on the game screen.                                |

Direct input sends characters immediately. Q/W remain text characters while typing. Input behavior depends on the game; standard Java ME TextBox/Form fields support direct typing and Enter confirmation. Downloaded screenshots remain full-resolution PNGs.

## Performance

The runtime uses **Serial GC, C1 JIT**, a small initial heap and limited native allocator arenas. Streaming captures RGB through tmpfs, avoids an intermediate PNG conversion and shares recently encoded JPEGs between viewers at the same quality. The UI updates image elements without rerendering the entire dashboard for each frame.

Short observations on **Apple M1 / Docker Desktop, Linux arm64**, with one user-supplied game at its online menu:

| Observation                              | Result                                   |
| :--------------------------------------- | :--------------------------------------- |
| JVM RSS before / after memory tuning     | Approximately **138 → 76 MiB**.          |
| Whole-app CPU while viewing / while idle | Approximately **44% → 9% of one core**.  |
| JVM RSS while viewing / while idle       | Approximately **78 MiB** in both states. |

These are roughly 10-second menu samples, not guarantees for every game, busy map or VPS. A 60 FPS target does not guarantee sustained 60 FPS on every host. Do not extrapolate maximum instance counts by multiplying these figures.

See [benchmark methods, raw observations and limitations](docs/BENCHMARKS.md). To inspect live heap and process memory:

```sh
scripts/profile-memory.sh
```

## Operations

```sh
# Status and logs
docker compose ps
docker compose logs --tail=100 api

# Stop temporarily while preserving data
docker compose stop

# Resume
docker compose start

# Consistent backup; the script temporarily stops the service
scripts/backup.sh
```

Games, metadata and RMS saves live in Docker volumes. **Do not run `docker compose down -v` if you need to preserve them.** The `restore-running` policy restarts previously running games after a service restart; it does not restore in-game RAM state.

Restoring with `scripts/restore.sh /path/control-center.tar.gz` overwrites data, so back up first. Operational scripts require Bash; restore also requires Python 3. Keep the previous image and a backup when upgrading so you can roll back.

## Supported scope

Designed for **one administrator on one host**, running trusted JARs. Games have separate JVMs but share a container. This is **not a sandbox for malicious code** or a multi-tenant hosting platform.

- The service binds to localhost by default. Use an SSH tunnel or VPN for remote access. For an internet-facing dashboard, configure HTTPS, `COOKIE_SECURE` and `PUBLIC_ORIGIN` using the [reverse-proxy configuration](infra/compose.proxy.yml).
- The container runs as a non-root user, with a read-only root filesystem, dropped capabilities and no Docker socket mount.
- TCP sockets are implemented. The upstream emulator's HTTP/HTTPS APIs remain stubs. Audio is disabled, and individual games and vendor APIs require compatibility testing.
- Commercial game JARs, accounts, personal saves and passwords are not bundled. Universal MIDlet compatibility and 50–100-instance capacity are not claimed.

See the [compatibility matrix](docs/COMPATIBILITY.md) and [verified project scope](docs/STATUS.md).

## Development & testing

Use **Node.js 24 LTS**. Emulator integration tests require Docker.

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

The original `ControlTest` fixture is built into the image. Export it after starting the service:

```sh
mkdir -p .cache
docker compose cp api:/opt/fixtures/control-test.jar .cache/control-test.jar
npx playwright install chromium
npm run test:e2e
```

The last complete local runtime verification recorded **27 unit tests** and **8 E2E tests** passing, covering keyboard input, pointers, saves, WebSocket authorization, five independent JVMs and idle streaming. Current GitHub Actions results are reported separately by the CI badge. See [verification notes](docs/VERIFICATION.md) for subsequent changes and their validation.

For API development, configure the environment and run `npm run dev`. For the UI, run `npm run dev:web`. Longer measurements use `npm run benchmark` and `scripts/soak.sh`; a completed 24-hour soak has not been certified.

## Documentation

| Document                                   | Contents                                                  |
| :----------------------------------------- | :-------------------------------------------------------- |
| [Architecture](docs/ARCHITECTURE.md)       | API, runtime, storage and frame/input paths.              |
| [API reference](docs/API.md)               | REST and WebSocket; live Swagger is available at `/docs`. |
| [Benchmarks](docs/BENCHMARKS.md)           | Measurements, test conditions and interpretation limits.  |
| [Verification](docs/VERIFICATION.md)       | Checks performed and their results.                       |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common issues and diagnostics.                            |
| [Project status](docs/STATUS.md)           | Implemented scope and remaining verification.             |

## License & acknowledgments

The UI/API and original `ControlTest` fixture use the **MIT License**. `runtime/Bridge.java` and FreeJ2ME-Plus use **GPL-3.0-or-later**. Other components retain their own licenses. See [LICENSE](LICENSE) and [third-party notices](docs/THIRD_PARTY.md) before distributing the combined runtime.

FreeJ2ME-Plus is pinned to commit `baca76a4dda6f30abac67fb4a3db009eed05f91c`. Emulator/bridge source and license notices are retained in the Docker image.

### NRMod x3 controls

The exact locally analyzed NRMod x3 build has a dedicated controls panel with Alt-modified keyboard shortcuts, touch action buttons and an explicit 650 ms star hold for the three-slot wrapper menu. Ordinary text input is preserved. See [profile controls and verification](docs/NRMODX3.md). The game JAR and decompiled source are not bundled.

The NRMod x3 panel also offers optional local gold and disciple-power statistics per slot: current counters, net changes, hourly rates and a baseline reset. It samples game memory every five seconds and works while live screens sleep. Gold rates reflect **net balance change**, including spending and transfers, rather than verified loot. Data unavailable to the client is shown as unavailable. See [tracking scope and limitations](docs/NRMODX3.md#local-farming-progress).
