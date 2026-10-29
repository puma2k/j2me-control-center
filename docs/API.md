# HTTP and WebSocket API

Responses are JSON except screenshot PNG; errors return `error`, `requestId`, and validation `issues` where applicable. IDs are constrained; game IDs are SHA-256 hex and instance IDs UUIDs.

Every `/api/*` endpoint except health and login requires a valid HttpOnly session cookie. Unsafe HTTP methods require either exact same Origin or `X-CSRF-Protection: 1` for non-browser CLI clients. Login is rate limited 10/minute; API 600/minute per client IP. Do not enable proxy IP trust without explicitly validating your reverse proxy network.

| Endpoint | Method | Input / output |
|---|---|---|
| `/api/health` | GET | public liveness/version |
| `/api/auth/login` | POST | `{username,password}` → session cookie |
| `/api/auth/me` | GET | username and expiry |
| `/api/auth/logout` | POST | revoke session |
| `/api/games` | GET | `?q=` search |
| `/api/games`, `/api/games/upload` | POST | multipart `file`; JAD requires `?gameId=` |
| `/api/games/:id` | GET/PATCH/DELETE | metadata; patch `{name}`; delete rejects references |
| `/api/instances` | GET/POST | list/create |
| `/api/instances/:id` | GET/PATCH/DELETE | detail/config/delete stopped instance and saves |
| `/api/instances/:id/start`, `stop`, `restart` | POST | serialized/idempotent operations |
| `/api/instances/bulk` | POST | `{action:"start"|"stop"|"restart",ids:[]}` → per-ID results |
| `/api/instances/:id/logs` | GET | `{text}` capped 64 KiB tail |
| `/api/instances/:id/metrics` | GET | pid, CPU%, RSS/PSS MB, uptime seconds |
| `/api/instances/:id/screenshot` | GET | native-resolution real PNG |
| `/api/metrics/summary` | GET | host + all instance metrics + stream counters |
| `/api/settings` | GET/POST | limits/defaults; hard caps from environment |
| `/api/events` | GET | last 100 audit events |
| `/docs` | GET | authenticated Swagger UI |

Create instance body:

```json
{"gameId":"<sha256>","name":"Phone 1","width":240,"height":320,"profile":"Nokia","fps":30,"heapMb":128,"restartPolicy":"manual","keyMapping":{"a":"LEFT","d":"RIGHT"}}
```

Resolution 128–640 × 128–854, FPS 1–60, heap 32–512 MB. Profiles: Standard, Nokia, LG, Motorola, Siemens. Patch the same fields except gameId only while stopped. API accepts supported resolutions, but each game may reject/misrender them. `restore-running` restarts game process after server restart, not in-game RAM state.

WS `/ws`: session cookie plus exact Origin required at upgrade. Max payload 16 KiB; 150 commands/sec per connection. Messages:

```json
{"type":"subscribe","ids":["<instance-id>"],"fps":10,"quality":75}
{"type":"key","ids":["<instance-id>"],"key":"OK","down":true}
{"type":"key","ids":["<instance-id>"],"key":"OK","down":false}
{"type":"pointer","id":"<instance-id>","action":"down","x":120,"y":250}
{"type":"pointer","id":"<instance-id>","action":"up","x":120,"y":250}
{"type":"release"}
{"type":"ping","time":123}
```

Subscribe at most nine IDs. Key names: UP/DOWN/LEFT/RIGHT/OK/BACK/SOFT_LEFT/SOFT_RIGHT, 0–9, *, #. Keys are mapped using the emulator's selected device profile. Server messages: ready/subscribed/frame/state/metrics/keyResult/pong/error/frameError. Frame is `{type:"frame",id,data:"<base64 JPEG>",mime:"image/jpeg",at:<epoch ms>}`. Metrics include cumulative frames/bytes/drops and last server capture/encode latency, not a claimed end-to-end latency. Client updates one image per ID and does not build a frame queue. Logout/revocation closes idle sockets within one second.

Save endpoints: `GET /api/instances/:id/saves` downloads a version-1 JSON archive of RMS/config; `POST` same path imports it. Stop the instance first. Archives are limited to 1000 regular files / 32 MiB decoded, only `rms/` and `config/` paths, with no traversal or symlinks. Import stages data and rolls back failed swaps. A lifecycle lock prevents Start racing with save operations.

Macro WS commands:

```json
{"type":"macro","ids":["<instance-id>"],"steps":[{"key":"OK","holdMs":100,"delayMs":500}]}
{"type":"cancelMacro"}
```

One macro per connection, max 100 steps / 60 seconds, each hold/delay bounded to 5 seconds. Events report started/completed/cancelled/failed, with an audit entry. Macro key ownership is separate from manual controls; cancel/disconnect releases only owned keys. No anti-cheat bypass or game-server automation is supplied.

Pointer actions are down/move/up in native framebuffer coordinates, bounded by the instance resolution. One connection owns an active pointer per instance; blur, disconnect, and runtime stop release or reset it. Click or drag directly on the game image to use touch controls.

Text input WS: `{"type":"text","id":"<instance-id>","text":"Xin chào","backspace":0}`; response `textResult` confirms forwarding to the runtime. Max 256 UTF-16 code units and 256 backspaces, no control characters. Text is not included in acknowledgements or audit events. It targets one instance. LCDUI TextBox / focused Form TextField edit their text through the event queue; Canvas games receive character key press/release codes (backspace 8), whose interpretation depends on the game. Character support depends on its font and input implementation.

The browser now focuses a native hidden text input when the game image is clicked (or its direct keyboard button). Input events are forwarded immediately; IME composition is committed once, Q/W are letters, Backspace deletes, arrows and Enter keep held control semantics. The old composer is optional and collapsed.

### Local game progress (NRMod x3)

- `GET /api/instances/:id/progress`: authenticated `{ progress: null | { at, slots } }`. A slot has `slot`, `status` (`waiting` or `ready`), and, when available, `since`, decimal-string `goldStart`/`gold`, `petSince`, decimal-string `petStart`/`petPower`. Unavailable disciple data has `petPower: null`. Snapshots older than 15 seconds or from a previous JVM are unavailable.
- `POST /api/instances/:id/progress/reset`: authenticated, CSRF-protected baseline reset for the supported running game. Returns `{ok:true}` after queuing the reset. It never modifies game money, power or saves. The new baseline appears on the next poll.

### Native text editor

`GET /api/instances/:id/text-editor` returns `{editor: null}` outside a native MIDP TextBox or focused Form TextField, or a private `{token, title, text, constraints, maxLength}` snapshot. Responses use `Cache-Control: no-store`. `POST /api/instances/:id/text-editor` accepts `{token, text}` (up to 256 UTF-16 code units) and replaces only that still-active text field. Both routes require authentication; POST requires the usual CSRF header. It does not submit the game form. Custom Canvas input keeps the existing direct input path through the explicit Keyboard action.

Text content travels through a private JVM protocol and is excluded from protocol runtime logging. It is not written to an editor state file. Password constraints produce a password input in the browser. Confirm remains an explicit user action.
