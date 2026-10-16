import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import type {
  Instance,
  Game,
  Key,
  Settings,
} from "../../../packages/shared/schema.js";
import { defaultKeyboard, keyCodes } from "../../../packages/shared/schema.js";
import { api, post } from "./api.js";
import "./style.css";
import { ScreenIdleTimer } from "./idle.js";
type Metric = {
  id: string;
  pid?: number;
  cpuPercent?: number;
  rssMb?: number;
  uptimeSeconds?: number;
  stream?: {
    frames: number;
    drops: number;
    latencyMs: number;
    bytes: number;
    since: number;
  };
};
type Summary = {
  total: number;
  running: number;
  failed: number;
  host: {
    cpus: number;
    load: number[];
    totalMemoryMb: number;
    freeMemoryMb: number;
  };
  instances: Metric[];
  viewers: number;
};
function App() {
  const [user, setUser] = useState<string | null>(null),
    [checking, setChecking] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [page, setPage] = useState("overview"),
    [instances, setInstances] = useState<Instance[]>([]),
    [games, setGames] = useState<Game[]>([]),
    [summary, setSummary] = useState<Summary | null>(null),
    [settings, setSettings] = useState<any>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [detail, setDetail] = useState<string | null>(null),
    [layout, setLayout] = useState(4),
    [search, setSearch] = useState(""),
    [createGame, setCreateGame] = useState<Game | null>(null),
    [logs, setLogs] = useState(""),
    [notice, setNotice] = useState("");
  const [frames, setFrames] = useState<Record<string, string>>({}),
    [connected, setConnected] = useState(false),
    [streamFps, setStreamFps] = useState(60),
    [quality, setQuality] = useState(60),
    [broadcast, setBroadcast] = useState(false),
    [macroText, setMacroText] = useState(
      '[{"key":"OK","holdMs":100,"delayMs":500}]',
    );
  const socket = useRef<WebSocket | null>(null);
  const frameImages = useRef<Record<string, HTMLImageElement | null>>({});
  const showError = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));
  const refresh = useCallback(async () => {
    const [i, g, m, s] = await Promise.all([
      api<Instance[]>("/instances"),
      api<Game[]>("/games"),
      api<Summary>("/metrics/summary"),
      api("/settings"),
    ]);
    setInstances(i);
    setGames(g);
    setSummary(m);
    setSettings(s);
  }, []);
  useEffect(() => {
    api("/auth/me")
      .then((x) => setUser(x.username))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    void refresh().catch(showError);
    const timer = setInterval(() => {
      void refresh().catch(showError);
    }, 3000);
    return () => clearInterval(timer);
  }, [user, refresh]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  const act = async (fn: () => Promise<unknown>, message = "Changes saved") => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      setNotice(message);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };
  const viewing = detail
    ? [detail]
    : page === "screens"
      ? selected.slice(0, layout)
      : [];
  const viewingKey = viewing.join(",");
  const idleEnabled = viewing.some((id) =>
    instances.some((i) => i.id === id && i.status === "running"),
  );
  const [screenSleeping, setScreenSleeping] = useState(false);
  const screenSleepingRef = useRef(false);
  const idleTimerRef = useRef<ScreenIdleTimer | null>(null);
  useEffect(() => {
    screenSleepingRef.current = false;
    setScreenSleeping(false);
    if (!viewingKey || !idleEnabled) return;
    const idle = new ScreenIdleTimer((sleeping) => {
      screenSleepingRef.current = sleeping;
      setScreenSleeping(sleeping);
    });
    idleTimerRef.current = idle;
    let swallowClick = false;
    const wakingKeys = new Set<string>();
    const block = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const down = (event: Event) => {
      const woke = idle.activity();
      if (event instanceof KeyboardEvent && wakingKeys.has(event.code)) {
        block(event);
        return;
      }
      if (event instanceof PointerEvent) {
        swallowClick = woke;
        if (!woke) idle.hold(`pointer:${event.pointerId}`);
      } else if (event instanceof KeyboardEvent) {
        if (woke) wakingKeys.add(event.code);
        else idle.hold(event.code);
      }
      if (woke) block(event);
    };
    const up = (event: Event) => {
      if (event instanceof PointerEvent) {
        idle.release(`pointer:${event.pointerId}`);
        if (swallowClick) block(event);
      } else if (event instanceof KeyboardEvent) {
        idle.release(event.code);
        if (wakingKeys.delete(event.code)) block(event);
      }
    };
    const click = (event: Event) => {
      if (swallowClick) {
        swallowClick = false;
        block(event);
      }
    };
    const activity = () => {
      idle.activity();
    };
    const blur = (event: Event) => {
      if (event.target === window) idle.releaseAll();
    };
    const listeners: [string, EventListener][] = [
      ["pointerdown", down],
      ["pointerup", up],
      ["pointercancel", up],
      ["keydown", down],
      ["keyup", up],
      ["click", click],
      ["input", activity],
      ["blur", blur],
    ];
    for (const [name, listener] of listeners)
      window.addEventListener(name, listener, true);
    return () => {
      idleTimerRef.current = null;
      idle.dispose();
      for (const [name, listener] of listeners)
        window.removeEventListener(name, listener, true);
    };
  }, [viewingKey, idleEnabled]);
  useEffect(() => {
    if (!user) return;
    let stopped = false,
      reconnect: ReturnType<typeof setTimeout>;
    const connect = () => {
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
      );
      socket.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "frame" && !screenSleepingRef.current) {
          const src = `data:${msg.mime};base64,${msg.data}`;
          const img = frameImages.current[msg.id];
          if (img) img.src = src;
          else setFrames((f) => ({ ...f, [msg.id]: src }));
        }
        if (msg.type === "state")
          setInstances((all) =>
            all.map((i) => (i.id === msg.instance.id ? msg.instance : i)),
          );
        if (msg.type === "error") showError(msg.error);
        if (msg.type === "textResult") setNotice("Text input sent to game");
        if (msg.type === "macro")
          setNotice(`Macro: ${msg.state}${msg.error ? " · " + msg.error : ""}`);
        if (msg.type === "keyResult" && msg.results.some((r: any) => !r.ok))
          showError(
            msg.results
              .filter((r: any) => !r.ok)
              .map((r: any) => r.error)
              .join(";"),
          );
      };
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) reconnect = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(reconnect);
      socket.current?.close();
    };
  }, [user]);
  useEffect(() => {
    const subscribe = () => {
      if (connected)
        socket.current?.send(
          JSON.stringify({
            type: "subscribe",
            ids: document.hidden || screenSleeping ? [] : viewing,
            fps: streamFps,
            quality,
          }),
        );
    };
    subscribe();
    document.addEventListener("visibilitychange", subscribe);
    setFrames((f) =>
      Object.fromEntries(
        Object.entries(f).filter(([id]) => viewing.includes(id)),
      ),
    );
    return () => document.removeEventListener("visibilitychange", subscribe);
  }, [connected, viewingKey, streamFps, quality, screenSleeping]);
  const targets = useRef<string[]>([]);
  targets.current = broadcast
    ? selected
    : detail
      ? [detail]
      : selected.slice(0, 1);
  const lastPointerMove = useRef(0);
  const sendPointer = (
    id: string,
    action: "down" | "move" | "up",
    e: React.PointerEvent<HTMLImageElement>,
  ) => {
    const img = e.currentTarget;
    if (action === "down") {
      if (!e.isPrimary || e.button !== 0) return;
      e.preventDefault();
      img.setPointerCapture(e.pointerId);
    }
    if (action === "move") {
      if (
        !img.hasPointerCapture(e.pointerId) ||
        Date.now() - lastPointerMove.current < 25
      )
        return;
      lastPointerMove.current = Date.now();
    }
    const box = img.getBoundingClientRect();
    const x = Math.max(
        0,
        Math.min(
          img.naturalWidth - 1,
          Math.floor(((e.clientX - box.left) * img.naturalWidth) / box.width),
        ),
      ),
      y = Math.max(
        0,
        Math.min(
          img.naturalHeight - 1,
          Math.floor(((e.clientY - box.top) * img.naturalHeight) / box.height),
        ),
      );
    if (socket.current?.readyState === 1)
      socket.current.send(
        JSON.stringify({ type: "pointer", id, action, x, y }),
      );
  };
  const sendKey = useCallback((key: Key, down: boolean) => {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(
        JSON.stringify({ type: "key", ids: targets.current, key, down }),
      );
  }, []);
  const keyboardSignature = JSON.stringify(
    instances.find((i) => i.id === detail)?.keyMapping || {},
  );
  useEffect(() => {
    const mapping: Record<string, Key> = {
      ...defaultKeyboard,
      ...JSON.parse(keyboardSignature),
    };
    const pressed = new Set<string>();
    const release = () => {
      pressed.clear();
      if (socket.current?.readyState === 1)
        socket.current.send(JSON.stringify({ type: "release" }));
    };
    const down = (e: KeyboardEvent) => {
      if (
        e.isComposing ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        !(detail || page === "screens") ||
        !targets.current.length ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;

      if (e.key.length === 1 || e.key === "Backspace") {
        e.preventDefault();
        const id = detail || targets.current[0];
        if (socket.current?.readyState === 1)
          socket.current.send(
            JSON.stringify({
              type: "text",
              id,
              text: e.key === "Backspace" ? "" : e.key,
              backspace: e.key === "Backspace" ? 1 : 0,
            }),
          );
        return;
      }
      const key = mapping[e.key];
      if (key) {
        e.preventDefault();
        if (!pressed.has(e.key)) {
          pressed.add(e.key);
          sendKey(key, true);
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      const key = mapping[e.key];
      if (key && pressed.has(e.key)) {
        pressed.delete(e.key);
        sendKey(key, false);
      }
    };
    const visibility = () => {
      if (document.hidden) release();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      release();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [detail, page, keyboardSignature, sendKey]);
  useEffect(() => {
    if (!detail || !user) return;
    const load = () =>
      api(`/instances/${detail}/logs`)
        .then((x) => setLogs(x.text))
        .catch(showError);
    void load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [detail, user]);
  const navigate = (p: string) => {
    setDetail(null);
    setPage(p);
    setSearch("");
  };
  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((v) => v !== id) : [...s, id],
    );
  const bulk = (action: string) => {
    if (!selected.length) return;
    if (
      action === "stop" &&
      selected.length > 1 &&
      !confirm(`Stop ${selected.length} selected instances?`)
    )
      return;
    void act(async () => {
      const results = await post("/instances/bulk", { action, ids: selected });
      const failures = results.filter((r: any) => !r.ok);
      if (failures.length)
        throw new Error(failures.map((r: any) => r.error).join(";"));
    });
  };
  const upload = async (file: File, gameId?: string) => {
    const data = new FormData();
    data.append("file", file);
    await api(`/games/upload${gameId ? `?gameId=${gameId}` : ""}`, {
      method: "POST",
      body: data,
    });
  };
  const current = instances.find((i) => i.id === detail);
  const metric = (id: string) => summary?.instances.find((m) => m.id === id);
  if (checking)
    return (
      <div className="login">
        <div className="spinner" />
        Connecting…
      </div>
    );
  if (!user)
    return (
      <div className="login">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setBusy(true);
            post("/auth/login", Object.fromEntries(data))
              .then((x) => setUser(x.username))
              .catch(showError)
              .finally(() => setBusy(false));
          }}
        >
          <div className="brandmark">
            J<span>2</span>ME
          </div>
          <p className="eyebrow">YOUR GAMES. YOUR INFRASTRUCTURE.</p>
          <h1>Control Center</h1>
          <p className="muted">Sign in to manage your Java ME instances.</p>
          <label>
            Username
            <input
              name="username"
              autoComplete="username"
              required
              defaultValue="admin"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in →"}
          </button>
          <p className="fine">Self-hosted · Private by default</p>
        </form>
      </div>
    );
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="logo">J</span>
          <div>
            J2ME<span>CONTROL CENTER</span>
          </div>
        </div>
        <p className="navtitle">WORKSPACE</p>
        <nav>
          {[
            ["overview", "◈", "Overview"],
            ["instances", "▤", "Instances"],
            ["screens", "▦", "Live screens"],
            ["library", "▧", "Game library"],
          ].map(([id, icon, label]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <span>{icon}</span>
              {label}
              {id === "instances" && <small>{instances.length}</small>}
            </button>
          ))}
        </nav>
        <p className="navtitle">SYSTEM</p>
        <nav>
          <button
            className={page === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
          >
            <span>⚙</span>Settings
          </button>
          <a href="/docs" target="_blank" rel="noreferrer">
            <span>↗</span>API reference
          </a>
        </nav>
        <div className="asidebottom">
          <span className={`dot ${connected ? "green" : ""}`} />
          {connected ? "Control channel online" : "Reconnecting…"}
          <div className="account">
            <div className="avatar">{user[0].toUpperCase()}</div>
            <div>
              {user}
              <span>Administrator</span>
            </div>
            <button
              title="Sign out"
              onClick={() => {
                void post("/auth/logout").then(() => {
                  socket.current?.close();
                  setUser(null);
                  setSelected([]);
                  setDetail(null);
                });
              }}
            >
              ↪
            </button>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            {detail
              ? "Instance detail"
              : {
                  overview: "Overview",
                  instances: "Instances",
                  screens: "Live screens",
                  library: "Game library",
                  settings: "Settings",
                }[page]}
          </div>
          <span className="private">
            <span className="dot green" /> PRIVATE WORKSPACE
          </span>
        </header>
        <div className="content">
          {error && (
            <div role="alert" className="banner error">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="toast">
              ✓ {notice}
            </div>
          )}
          <div className="pagetitle">
            <div>
              <p className="eyebrow">JAVA ME OPERATIONS</p>
              <h1>
                {current
                  ? current.name
                  : {
                      overview: "Every instance. One control center.",
                      instances: "Instances",
                      screens: "Live screens",
                      library: "Game library",
                      settings: "System settings",
                    }[page]}
              </h1>
              <p className="muted">
                {current
                  ? "Watch the live screen and control your game directly."
                  : page === "library"
                    ? "Your games, ready to launch. JAR and JAD supported."
                    : page === "screens"
                      ? "Choose instances to watch together. Games keep running when you close the viewer."
                      : "Monitor, launch and control Java ME on your own infrastructure."}
              </p>
            </div>
            <div className="actions">
              {detail ? (
                <button onClick={() => setDetail(null)}>← Back</button>
              ) : (
                <button
                  className="primary"
                  onClick={() => {
                    if (games.length) setCreateGame(games[0]);
                    else navigate("library");
                  }}
                >
                  ＋ Create instance
                </button>
              )}
            </div>
          </div>
          {!detail && page === "overview" && (
            <>
              <div className="stats">
                {[
                  ["Total instances", instances.length, "In this workspace"],
                  ["Running", summary?.running ?? "—", "Active processes"],
                  [
                    "Stopped",
                    instances.filter((i) =>
                      ["stopped", "created"].includes(i.status),
                    ).length,
                    "Ready to launch",
                  ],
                  [
                    "Needs attention",
                    summary?.failed ?? "—",
                    "Failed instances",
                  ],
                ].map(([label, value, hint], n) => (
                  <div className="stat" key={label}>
                    <span>{label}</span>
                    <strong
                      className={
                        n === 1
                          ? "accent"
                          : n === 3 && Number(value) > 0
                            ? "danger"
                            : ""
                      }
                    >
                      {value}
                      <small>{["▦", "●", "◷", "!"][n]}</small>
                    </strong>
                    <p>{hint}</p>
                  </div>
                ))}
              </div>
              <div className="sectionheading">
                <h2>Workspace activity</h2>
                <span className="muted">Updates every 3 seconds</span>
              </div>
              <div className="resourcegrid">
                <div className="panel resource">
                  <span className="muted">SERVER LOAD · 1 MIN</span>
                  <strong>
                    {summary?.host.load[0].toFixed(2) ?? "—"}
                    <small>/ {summary?.host.cpus ?? "—"} cores</small>
                  </strong>
                  <div className="bar">
                    <i
                      style={{
                        width: `${Math.min(100, ((summary?.host.load[0] || 0) / (summary?.host.cpus || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="panel resource">
                  <span className="muted">HOST MEMORY</span>
                  <strong>
                    {summary
                      ? (
                          (summary.host.totalMemoryMb -
                            summary.host.freeMemoryMb) /
                          1024
                        ).toFixed(1)
                      : "—"}
                    <small>
                      /{" "}
                      {summary
                        ? (summary.host.totalMemoryMb / 1024).toFixed(1)
                        : "—"}{" "}
                      GB
                    </small>
                  </strong>
                  <div className="bar purple">
                    <i
                      style={{
                        width: `${summary ? (1 - summary.host.freeMemoryMb / summary.host.totalMemoryMb) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="panel resource">
                  <span className="muted">LIVE CONNECTIONS</span>
                  <strong>
                    {summary?.viewers ?? "—"}
                    <small>viewer connections</small>
                  </strong>
                  <p className="fine">
                    Frames are captured only while someone is watching
                  </p>
                </div>
              </div>
            </>
          )}
          {!detail && ["overview", "instances"].includes(page) && (
            <section className="panel">
              <div className="panelhead">
                <h2>
                  Game instances{" "}
                  <span className="count">{instances.length}</span>
                </h2>
                <input
                  className="search"
                  placeholder="Search instances…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="toolbar">
                <span>{selected.length} selected</span>
                <button
                  disabled={busy || !selected.length}
                  onClick={() => bulk("start")}
                >
                  ▷ Start
                </button>
                <button
                  disabled={busy || !selected.length}
                  onClick={() => bulk("stop")}
                >
                  □ Stop
                </button>
                <button
                  disabled={busy || !selected.length}
                  onClick={() => bulk("restart")}
                >
                  ↻ Restart
                </button>
                <button
                  disabled={!selected.length}
                  onClick={() => navigate("screens")}
                >
                  ▦ View screens
                </button>
                <button
                  className="pushright"
                  onClick={() => setSelected(instances.map((i) => i.id))}
                >
                  Select all
                </button>
              </div>
              {!instances.length ? (
                <div className="empty">
                  <span>▦</span>
                  <h3>Your workspace is empty</h3>
                  <p>
                    Upload your first game and create an instance to get
                    started.
                  </p>
                  <button onClick={() => navigate("library")}>
                    Open library →
                  </button>
                </div>
              ) : (
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th></th>
                        <th>INSTANCE / GAME</th>
                        <th>STATUS</th>
                        <th>CPU</th>
                        <th>MEMORY</th>
                        <th>PID / UPTIME</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {instances
                        .filter((i) =>
                          i.name.toLowerCase().includes(search.toLowerCase()),
                        )
                        .map((i) => (
                          <tr key={i.id}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Select ${i.name}`}
                                checked={selected.includes(i.id)}
                                onChange={() => toggle(i.id)}
                              />
                            </td>
                            <td>
                              <button
                                className="textbutton"
                                onClick={() => setDetail(i.id)}
                              >
                                {i.name}
                              </button>
                              <small>
                                {games.find((g) => g.id === i.gameId)?.name ||
                                  i.gameId.slice(0, 8)}{" "}
                                · {i.width}×{i.height}
                              </small>
                            </td>
                            <td>
                              <Status value={i.status} />
                              {i.error && (
                                <small className="danger" title={i.error}>
                                  View error details
                                </small>
                              )}
                            </td>
                            <td>
                              {i.status === "running"
                                ? `${(metric(i.id)?.cpuPercent || 0).toFixed(1)}%`
                                : "—"}
                            </td>
                            <td>
                              {i.status === "running"
                                ? `${(metric(i.id)?.rssMb || 0).toFixed(0)} MB`
                                : "—"}
                            </td>
                            <td>
                              {metric(i.id)?.pid || "—"}
                              <small>
                                {metric(i.id)?.uptimeSeconds
                                  ? `${Math.floor(metric(i.id)!.uptimeSeconds!)}s`
                                  : "—"}
                              </small>
                            </td>
                            <td>
                              <div className="rowactions">
                                <button
                                  aria-label={`${i.status === "running" ? "Stop" : "Start"} ${i.name}`}
                                  disabled={
                                    busy ||
                                    ["starting", "stopping"].includes(i.status)
                                  }
                                  onClick={() =>
                                    void act(() =>
                                      post(
                                        `/instances/${i.id}/${i.status === "running" ? "stop" : "start"}`,
                                      ),
                                    )
                                  }
                                >
                                  {i.status === "running" ? "□" : "▷"}
                                </button>
                                <button
                                  title="Restart"
                                  disabled={busy}
                                  onClick={() =>
                                    void act(() =>
                                      post(`/instances/${i.id}/restart`),
                                    )
                                  }
                                >
                                  ↻
                                </button>
                                <button
                                  title="Details"
                                  onClick={() => setDetail(i.id)}
                                >
                                  ↗
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {!detail && page === "library" && (
            <>
              <label className="upload">
                <input
                  aria-label="Upload game"
                  type="file"
                  accept=".jar,.jad"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void act(() => upload(f), "Game added to library");
                    e.target.value = "";
                  }}
                />
                <span>⇧</span>
                <h3>Add games to your library</h3>
                <p>Choose a JAR · up to 32 MB · SHA-256 deduplication</p>
                <strong>Choose file</strong>
              </label>
              <div className="sectionheading">
                <h2>
                  Game library <span className="count">{games.length}</span>
                </h2>
                <input
                  placeholder="Search games…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="gamegrid">
                {games
                  .filter((g) =>
                    g.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((g) => (
                    <div className="panel game" key={g.id}>
                      <div className="gameicon">
                        J<span>ME</span>
                      </div>
                      <h3>{g.name}</h3>
                      <p>
                        {g.vendor || "Unknown vendor"} · v{g.version || "—"}
                      </p>
                      <code title={g.id}>{g.id.slice(0, 16)}…</code>
                      <p className="fine">{g.filename}</p>
                      <div className="actions">
                        <button
                          className="primary"
                          onClick={() => setCreateGame(g)}
                        >
                          ＋ Create instance
                        </button>
                        <button
                          title="Rename"
                          onClick={() => {
                            const name = prompt("Display name", g.name);
                            if (name)
                              void act(() =>
                                api(`/games/${g.id}`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ name }),
                                }),
                              );
                          }}
                        >
                          ✎
                        </button>
                        <button
                          title="Delete game"
                          onClick={() => {
                            if (confirm(`Delete game ${g.name}?`))
                              void act(() =>
                                api(`/games/${g.id}`, { method: "DELETE" }),
                              );
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <label className="jad">
                        ＋ Attach JAD
                        <input
                          type="file"
                          accept=".jad"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void act(() => upload(f, g.id));
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  ))}
              </div>
              {!games.length && (
                <div className="empty">
                  <h3>No games yet</h3>
                  <p>
                    Only use games you have permission to run. No commercial
                    games are bundled.
                  </p>
                </div>
              )}
            </>
          )}
          {(detail || page === "screens") && (
            <>
              <div className="toolbar panel">
                <span className={`dot ${connected ? "green" : ""}`} />
                {connected ? "Live channel" : "Reconnecting"}
                {!detail && (
                  <>
                    <select
                      aria-label="Grid layout"
                      value={layout}
                      onChange={(e) => setLayout(Number(e.target.value))}
                    >
                      {[1, 2, 4, 9].map((n) => (
                        <option key={n} value={n}>
                          {n} screens
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Add screen"
                      value=""
                      onChange={(e) => {
                        if (
                          e.target.value &&
                          !selected.includes(e.target.value)
                        )
                          setSelected((s) => [...s, e.target.value]);
                      }}
                    >
                      <option value="">＋ Choose instance</option>
                      {instances.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <label>
                  FPS{" "}
                  <select
                    value={streamFps}
                    onChange={(e) => setStreamFps(Number(e.target.value))}
                  >
                    {[2, 5, 8, 10, 15, 20, 30, 60].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Quality{" "}
                  <select
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                  >
                    {[30, 50, 60, 75, 90].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label className="pushright">
                  <input
                    type="checkbox"
                    checked={broadcast}
                    onChange={(e) => setBroadcast(e.target.checked)}
                  />{" "}
                  Send keys to all selected ({selected.length})
                </label>
              </div>
              <div
                className={detail ? "detailgrid" : `screengrid grid${layout}`}
              >
                <div
                  className={detail ? "panel viewerpanel" : "screencontents"}
                >
                  {viewing.length ? (
                    viewing.map((id) => (
                      <div className="screen" key={id}>
                        <div className="screenhead">
                          <button
                            className="textbutton"
                            onClick={() => setDetail(id)}
                          >
                            {instances.find((i) => i.id === id)?.name}
                          </button>
                          <Status
                            value={
                              instances.find((i) => i.id === id)?.status ||
                              "stopped"
                            }
                          />
                          {!detail && (
                            <button onClick={() => toggle(id)}>×</button>
                          )}
                        </div>
                        <div className="framearea">
                          {screenSleeping &&
                          instances.find((i) => i.id === id)?.status ===
                            "running" ? (
                            <button
                              className="screen-sleep"
                              aria-label="Wake screen"
                              onClick={() => idleTimerRef.current?.activity()}
                            >
                              <span>Screen is sleeping</span>
                              <small>
                                Tap or press a key to resume viewing. Your game
                                is still running.
                              </small>
                            </button>
                          ) : frames[id] &&
                            instances.find((i) => i.id === id)?.status ===
                              "running" ? (
                            <DirectGameInput
                              id={id}
                              sendKey={(key, down) => {
                                if (socket.current?.readyState === 1)
                                  socket.current.send(
                                    JSON.stringify({
                                      type: "key",
                                      ids: [id],
                                      key,
                                      down,
                                    }),
                                  );
                              }}
                              sendText={(text, backspace) => {
                                if (socket.current?.readyState === 1)
                                  socket.current.send(
                                    JSON.stringify({
                                      type: "text",
                                      id,
                                      text,
                                      backspace,
                                    }),
                                  );
                              }}
                              release={() => {
                                if (socket.current?.readyState === 1)
                                  socket.current.send(
                                    JSON.stringify({ type: "release" }),
                                  );
                              }}
                            >
                              <img
                                ref={(img) => {
                                  frameImages.current[id] = img;
                                }}
                                data-testid={`frame-${id}`}
                                alt={`Screen ${instances.find((i) => i.id === id)?.name}`}
                                src={frames[id]}
                                draggable={false}
                                style={{
                                  touchAction: "none",
                                  cursor: "crosshair",
                                }}
                                onPointerDown={(e) =>
                                  sendPointer(id, "down", e)
                                }
                                onPointerMove={(e) =>
                                  sendPointer(id, "move", e)
                                }
                                onPointerUp={(e) => sendPointer(id, "up", e)}
                                onPointerCancel={(e) =>
                                  sendPointer(id, "up", e)
                                }
                                onLostPointerCapture={(e) =>
                                  sendPointer(id, "up", e)
                                }
                              />
                            </DirectGameInput>
                          ) : (
                            <div className="empty">
                              <span>▣</span>
                              <p>
                                {instances.find((i) => i.id === id)?.status ===
                                "running"
                                  ? "Waiting for frames…"
                                  : "Instance is not running"}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="screenfooter">
                          {screenSleeping
                            ? "Stream paused · Game FPS unchanged"
                            : metric(id)?.stream
                              ? `${(metric(id)!.stream!.frames / Math.max(1, (Date.now() - metric(id)!.stream!.since) / 1000)).toFixed(1)} FPS · ${metric(id)!.stream!.latencyMs} ms capture · ${metric(id)!.stream!.drops} dropped`
                              : "No stream data yet"}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty">
                      <h3>Choose instances to watch</h3>
                      <p>
                        Use the menu above or select from the Instances table.
                      </p>
                    </div>
                  )}
                </div>
                <div className="panel gamepad">
                  <div className="panelhead">
                    <h2>Controls</h2>
                    <span className="count">LIVE INPUT</span>
                  </div>
                  <div className="padbody">
                    <div className="softkeys">
                      {(["SOFT_LEFT", "BACK", "SOFT_RIGHT"] as Key[]).map(
                        (k) => (
                          <Pad
                            key={k}
                            code={k}
                            text={
                              {
                                SOFT_LEFT: "Soft L",
                                BACK: "Back",
                                SOFT_RIGHT: "Soft R",
                              }[k as "BACK"]
                            }
                            send={sendKey}
                            disabled={!connected || !targets.current.length}
                          />
                        ),
                      )}
                    </div>
                    <div className="dpad">
                      <Pad code="UP" text="▲" send={sendKey} />
                      <Pad code="LEFT" text="◀" send={sendKey} />
                      <Pad code="OK" text="OK" send={sendKey} />
                      <Pad code="RIGHT" text="▶" send={sendKey} />
                      <Pad code="DOWN" text="▼" send={sendKey} />
                    </div>
                    <div className="numpad">
                      {[
                        "1",
                        "2",
                        "3",
                        "4",
                        "5",
                        "6",
                        "7",
                        "8",
                        "9",
                        "*",
                        "0",
                        "#",
                      ].map((k) => (
                        <Pad key={k} code={k as Key} text={k} send={sendKey} />
                      ))}
                    </div>
                    <details className="macro">
                      <summary>Paste text (optional)</summary>
                      <TextKeyboard
                        key={detail || targets.current[0]}
                        disabled={!connected || !targets.current.length}
                        send={(text, backspace) => {
                          const id = detail || targets.current[0];
                          if (
                            !id ||
                            socket.current?.readyState !== WebSocket.OPEN
                          )
                            return false;
                          socket.current.send(
                            JSON.stringify({
                              type: "text",
                              id,
                              text,
                              backspace,
                            }),
                          );
                          return true;
                        }}
                      />
                    </details>
                    <details className="macro">
                      <summary>Basic macros</summary>
                      <textarea
                        aria-label="Macro JSON"
                        value={macroText}
                        onChange={(e) => setMacroText(e.target.value)}
                      />
                      <div className="actions">
                        <button
                          onClick={() => {
                            try {
                              socket.current?.send(
                                JSON.stringify({
                                  type: "macro",
                                  ids: targets.current,
                                  steps: JSON.parse(macroText),
                                }),
                              );
                            } catch {
                              setError("Invalid macro JSON");
                            }
                          }}
                        >
                          ▷ Run macro
                        </button>
                        <button
                          onClick={() =>
                            socket.current?.send(
                              JSON.stringify({ type: "cancelMacro" }),
                            )
                          }
                        >
                          □ Cancel
                        </button>
                      </div>
                      <p className="fine">
                        Up to 100 steps / 60 seconds. Disconnecting cancels
                        macros and releases keys.
                      </p>
                    </details>
                    <p className="fine">
                      Arrows to move · Enter to confirm · Type directly
                      <br />
                      Keys are released on focus loss or disconnect.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
          {current && (
            <>
              <div className="detailactions">
                <Status value={current.status} />
                {["start", "stop", "restart"].map((action) => (
                  <button
                    key={action}
                    disabled={busy}
                    onClick={() =>
                      void act(() => post(`/instances/${current.id}/${action}`))
                    }
                  >
                    {action}
                  </button>
                ))}
                <a
                  className="button"
                  href={`/api/instances/${current.id}/screenshot`}
                  download
                >
                  ↓ Screenshot PNG
                </a>
                <a
                  className="button"
                  href={`/api/instances/${current.id}/saves`}
                  download
                >
                  ↓ Export saves
                </a>
                <label className="button">
                  ↑ Import saves
                  <input
                    type="file"
                    accept=".json"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (
                        f &&
                        confirm(
                          "Replace the current RMS/config? The instance must be stopped.",
                        )
                      )
                        void act(async () =>
                          post(
                            `/instances/${current.id}/saves`,
                            JSON.parse(await f.text()),
                          ),
                        );
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  className="danger pushright"
                  onClick={() => {
                    if (
                      confirm("Delete this instance and all of its saved data?")
                    )
                      void act(async () => {
                        await api(`/instances/${current.id}`, {
                          method: "DELETE",
                        });
                        setDetail(null);
                      });
                  }}
                >
                  Delete instance
                </button>
              </div>
              {current.error && (
                <div className="banner error">{current.error}</div>
              )}
              <div className="configgrid">
                <section className="panel config">
                  <h2>Instance configuration</h2>
                  <ConfigForm
                    instance={current}
                    disabled={busy || current.status === "running"}
                    save={(patch) =>
                      void act(() =>
                        api(`/instances/${current.id}`, {
                          method: "PATCH",
                          body: JSON.stringify(patch),
                        }),
                      )
                    }
                  />
                </section>
                <section className="panel logpanel">
                  <div className="panelhead">
                    <h2>Runtime logs</h2>
                    <span className="count">STDOUT / STDERR</span>
                  </div>
                  <pre>
                    {logs || "No logs yet. Start an instance to begin."}
                  </pre>
                </section>
              </div>
            </>
          )}
          {!detail && page === "settings" && settings && (
            <div className="configgrid">
              <section className="panel config">
                <h2>Limits & streaming</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    void act(() =>
                      post(
                        "/settings",
                        Object.fromEntries(
                          [...data].map(([k, v]) => [k, Number(v)]),
                        ),
                      ),
                    );
                  }}
                >
                  {[
                    ["maxInstances", "Maximum instances"],
                    ["memoryBudgetMb", "Admission memory budget (MB)"],
                    ["streamFps", "Default stream FPS"],
                    ["quality", "JPEG quality"],
                  ].map(([name, label]) => (
                    <label key={name}>
                      {label}
                      <input
                        name={name}
                        type="number"
                        defaultValue={settings[name]}
                        required
                      />
                    </label>
                  ))}
                  <p className="fine">
                    Limits cannot exceed the environment hard caps. -Xmx limits
                    the Java heap; total RSS is higher.
                  </p>
                  <button className="primary" disabled={busy}>
                    Save settings
                  </button>
                </form>
              </section>
              <section className="panel config">
                <h2>Diagnostics</h2>
                <dl>
                  {Object.entries(settings.diagnostics).map(([k, v]) => (
                    <React.Fragment key={k}>
                      <dt>{k}</dt>
                      <dd>{String(v)}</dd>
                    </React.Fragment>
                  ))}
                </dl>
                <p className="fine">
                  Only run trusted JARs. JVMs in a shared container are not a
                  security sandbox for malicious code.
                </p>
              </section>
            </div>
          )}
          <footer>
            <span>J2ME CONTROL CENTER</span>
            <span>Self-hosted · FreeJ2ME-Plus · v1.0</span>
          </footer>
        </div>
      </main>
      {createGame && (
        <div className="modalback">
          <div className="modal">
            <div className="panelhead">
              <h2>Create instance</h2>
              <button onClick={() => setCreateGame(null)}>×</button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                void act(async () => {
                  const i = await post("/instances", {
                    gameId: String(d.get("gameId")),
                    name: d.get("name"),
                    width: Number(d.get("width")),
                    height: Number(d.get("height")),
                    heapMb: Number(d.get("heapMb")),
                    fps: Number(d.get("fps")),
                    profile: d.get("profile"),
                    restartPolicy: d.get("restartPolicy"),
                  });
                  setCreateGame(null);
                  setSelected((s) => [...s, i.id]);
                  navigate("instances");
                }, "Instance created");
              }}
            >
              <label>
                Game
                <select name="gameId" defaultValue={createGame.id}>
                  {games.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Instance name
                <input
                  name="name"
                  required
                  maxLength={80}
                  defaultValue={`${createGame.name} ${instances.length + 1}`}
                />
              </label>
              <ConfigFields />
              <button className="primary full" disabled={busy}>
                {busy ? "Creating…" : "Create instance"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className={`status ${value}`}>
      <span className="dot" />
      {value}
    </span>
  );
}
function Pad({
  code,
  text,
  send,
  disabled = false,
}: {
  code: Key;
  text: string;
  send: (key: Key, down: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`pad pad-${code}`}
      aria-label={`Key ${code}`}
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        send(code, true);
      }}
      onPointerUp={() => send(code, false)}
      onPointerCancel={() => send(code, false)}
      onLostPointerCapture={() => send(code, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {text}
    </button>
  );
}
function ConfigFields({ instance }: { instance?: Instance }) {
  return (
    <>
      <div className="formrow">
        <label>
          Width
          <input
            name="width"
            type="number"
            min="128"
            max="640"
            defaultValue={instance?.width || 240}
            required
          />
        </label>
        <label>
          Height
          <input
            name="height"
            type="number"
            min="128"
            max="854"
            defaultValue={instance?.height || 320}
            required
          />
        </label>
      </div>
      <div className="formrow">
        <label>
          Heap (MB)
          <input
            name="heapMb"
            type="number"
            min="32"
            max="512"
            defaultValue={instance?.heapMb || 128}
            required
          />
        </label>
        <label>
          Game FPS
          <input
            name="fps"
            type="number"
            min="1"
            max="60"
            defaultValue={instance?.fps || 60}
            required
          />
        </label>
      </div>
      <label>
        Device profile
        <select name="profile" defaultValue={instance?.profile || "Nokia"}>
          {["Nokia", "Standard", "LG", "Motorola", "Siemens"].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <label>
        After server restart
        <select
          name="restartPolicy"
          defaultValue={instance?.restartPolicy || "manual"}
        >
          <option value="manual">Manual</option>
          <option value="restore-running">Restore if previously running</option>
        </select>
      </label>
    </>
  );
}
function ConfigForm({
  instance,
  disabled,
  save,
}: {
  instance: Instance;
  disabled: boolean;
  save: (p: unknown) => void;
}) {
  return (
    <form
      key={`${instance.id}-${instance.width}-${instance.height}`}
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        try {
          save({
            name: String(d.get("name")),
            width: Number(d.get("width")),
            height: Number(d.get("height")),
            heapMb: Number(d.get("heapMb")),
            fps: Number(d.get("fps")),
            profile: d.get("profile"),
            restartPolicy: d.get("restartPolicy"),
            keyMapping: JSON.parse(String(d.get("keyMapping"))),
          });
        } catch {
          alert("Key mapping must be valid JSON");
        }
      }}
    >
      <fieldset disabled={disabled}>
        <label>
          Name
          <input name="name" defaultValue={instance.name} required />
        </label>
        <ConfigFields instance={instance} />
        <label>
          Keyboard mapping (JSON)
          <textarea
            name="keyMapping"
            defaultValue={JSON.stringify(instance.keyMapping, null, 2)}
            placeholder={'{"a":"LEFT","d":"RIGHT"}'}
          />
        </label>
        <p className="fine">
          Stop the instance before editing. Valid keys:{" "}
          {Object.keys(keyCodes).join(", ")}.
        </p>
        <button className="primary">Save configuration</button>
      </fieldset>
    </form>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

function TextKeyboard({
  disabled,
  send,
}: {
  disabled: boolean;
  send: (text: string, backspace: number) => boolean;
}) {
  const [draft, setDraft] = useState("");
  const [hidden, setHidden] = useState(true);
  return (
    <form
      className="text-keyboard"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft && send(draft, 0)) setDraft("");
      }}
    >
      <label htmlFor="game-text">Text input</label>
      <input
        id="game-text"
        aria-label="Game text input"
        type={hidden ? "password" : "text"}
        value={draft}
        maxLength={256}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        disabled={disabled}
        placeholder="Tap to open your phone keyboard"
        onChange={(e) => setDraft(e.target.value)}
      />
      <label className="text-hide">
        <input
          type="checkbox"
          checked={hidden}
          onChange={(e) => setHidden(e.target.checked)}
        />
        Hide text
      </label>
      <div className="text-actions">
        <button type="submit" disabled={disabled || !draft}>
          Send text to game
        </button>
        <button type="button" disabled={disabled} onClick={() => send("", 1)}>
          Delete one character in game
        </button>
      </div>
      <p>
        Select a text field in the game, type or paste here, then send. Enter
        also sends text. Input goes only to the game you are viewing.
      </p>
    </form>
  );
}

function DirectGameInput({
  id,
  children,
  sendKey,
  sendText,
  release,
}: {
  id: string;
  children: React.ReactNode;
  sendKey: (key: Key, down: boolean) => void;
  sendText: (text: string, backspace: number) => void;
  release: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => release(), []);
  const composing = useRef(false);
  const [focused, setFocused] = useState(false);
  const held = useRef(new Set<Key>());
  const flush = () => {
    const el = input.current;
    if (!el || composing.current) return;
    const value = el.value;
    if (value === "") sendText("", 1);
    else {
      const text = value.startsWith(" ") ? value.slice(1) : value;
      const clean = text.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 256);
      if (clean) sendText(clean, 0);
    }
    el.value = " ";
    el.setSelectionRange(1, 1);
  };
  const focus = () => {
    input.current?.focus({ preventScroll: true });
    input.current?.setSelectionRange(1, 1);
  };
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) focus();
  }, []);
  return (
    <div
      className="direct-game-input"
      onClick={(e) => {
        if (e.target instanceof HTMLImageElement) focus();
      }}
    >
      {children}
      <textarea
        ref={input}
        className="direct-keyboard-capture"
        aria-label={`Direct input ${id}`}
        defaultValue=" "
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          composing.current = false;
          if (input.current) input.current.value = " ";
          held.current.clear();
          release();
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          flush();
        }}
        onInput={(e) => {
          if (!(e.nativeEvent as InputEvent).isComposing) flush();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.nativeEvent.isComposing || composing.current) return;
          if (e.key === "Escape") {
            e.preventDefault();
            input.current?.blur();
            return;
          }
          if (e.key === "Backspace") {
            e.preventDefault();
            sendText("", 1);
            return;
          }
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          const k = (
            {
              ArrowUp: "UP",
              ArrowDown: "DOWN",
              ArrowLeft: "LEFT",
              ArrowRight: "RIGHT",
              Enter: "OK",
            } as Record<string, Key>
          )[e.key];
          if (k) {
            e.preventDefault();
            if (!held.current.has(k)) {
              held.current.add(k);
              sendKey(k, true);
            }
          }
        }}
        onKeyUp={(e) => {
          e.stopPropagation();
          const k = (
            {
              ArrowUp: "UP",
              ArrowDown: "DOWN",
              ArrowLeft: "LEFT",
              ArrowRight: "RIGHT",
              Enter: "OK",
            } as Record<string, Key>
          )[e.key];
          if (k && held.current.has(k)) {
            held.current.delete(k);
            sendKey(k, false);
          }
        }}
      />
      <button
        type="button"
        className="direct-keyboard-toggle"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => (focused ? input.current?.blur() : focus())}
      >
        {focused ? "Hide keyboard" : "⌨ Type directly"}
      </button>
      <small>
        Tap the screen and type directly. Open your phone keyboard here.
      </small>
    </div>
  );
}
