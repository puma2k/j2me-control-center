import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { WebSocket } from "ws";
import { once } from "node:events";
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
test("five independent JVMs, quota, true input/frame, disconnect release, restart and saves", async ({
  request,
  baseURL,
}) => {
  test.setTimeout(Number(process.env.RUNTIME_TEST_TIMEOUT_MS || 180000));
  const headers = { "x-csrf-protection": "1" };
  let ids: string[] = [];
  await request.post("/api/auth/login", {
    headers,
    data: { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD },
  });
  const upload = await request.post("/api/games/upload", {
    headers,
    multipart: {
      file: {
        name: "control-test.jar",
        mimeType: "application/java-archive",
        buffer: readFileSync(".cache/control-test.jar"),
      },
    },
  });
  expect(upload.ok()).toBe(true);
  const game = await upload.json();
  try {
    for (let n = 0; n < 5; n++) {
      const res = await request.post("/api/instances", {
        headers,
        data: {
          gameId: game.id,
          name: `Integration ${n}-${Date.now()}`,
          restartPolicy: "restore-running",
        },
      });
      expect(res.ok()).toBe(true);
      ids.push((await res.json()).id);
    }
    const started = await Promise.all(
      ids.map((id) => request.post(`/api/instances/${id}/start`, { headers })),
    );
    expect(started.every((r) => r.ok())).toBe(true);
    const metrics = await Promise.all(
      ids.map((id) =>
        request.get(`/api/instances/${id}/metrics`).then((r) => r.json()),
      ),
    );
    expect(new Set(metrics.map((m) => m.pid)).size).toBe(5);
    expect(metrics.every((m) => m.rssMb > 0)).toBe(true);
    const a = await request.post("/api/instances", {
      headers,
      data: { gameId: game.id, name: "Over quota" },
    });
    const extra = (await a.json()).id;
    ids.push(extra);
    expect(
      (
        await request.post(`/api/instances/${extra}/start`, { headers })
      ).status(),
    ).toBe(409);
    const frames = await Promise.all(
      ids
        .slice(0, 5)
        .map((id) =>
          request.get(`/api/instances/${id}/screenshot`).then((r) => r.body()),
        ),
    );
    expect(frames.every((b) => b.subarray(1, 4).toString() === "PNG")).toBe(
      true,
    );
    const state = await request.storageState(),
      cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const ws = new WebSocket(baseURL!.replace("http", "ws") + "/ws", {
      headers: { cookie, origin: baseURL! },
    });
    await once(ws, "open");
    const messages: any[] = [];
    ws.on("message", (b) => messages.push(JSON.parse(b.toString())));
    ws.send(JSON.stringify({ type: "subscribe", ids: [ids[0]], fps: 5 }));
    ws.send(
      JSON.stringify({ type: "key", ids: [ids[0]], key: "OK", down: true }),
    );
    await expect
      .poll(() => messages.some((m) => m.type === "frame"))
      .toBe(true);
    await expect
      .poll(() =>
        messages.some((m) => m.type === "keyResult" && m.results[0].ok),
      )
      .toBe(true);
    ws.close();
    await once(ws, "close");
    await expect
      .poll(async () => {
        const r = await request.get(`/api/instances/${ids[0]}/logs`);
        return (await r.json()).text;
      })
      .toContain("TEST_RELEASE -5");
    const changed = await request.get(`/api/instances/${ids[0]}/screenshot`);
    expect(Buffer.compare(await changed.body(), frames[0])).not.toBe(0);
    const unchanged = await request.get(`/api/instances/${ids[1]}/screenshot`);
    expect(Buffer.compare(await unchanged.body(), frames[1])).toBe(0);
    expect(
      (
        await request.post(`/api/instances/${ids[0]}/restart`, { headers })
      ).ok(),
    ).toBe(true);
    const after = await request
      .get(`/api/instances/${ids[1]}/metrics`)
      .then((r) => r.json());
    expect(after.pid).toBe(metrics[1].pid);
    await request.post(`/api/instances/${ids[0]}/stop`, { headers });
    const stopped = await request
      .get(`/api/instances/${ids[0]}/metrics`)
      .then((r) => r.json());
    expect(stopped.pid).toBe(null);
  } finally {
    for (const id of ids) {
      await request.post(`/api/instances/${id}/stop`, { headers });
      await request.delete(`/api/instances/${id}`, { headers });
    }
  }
});
test("WebSocket rejects anonymous upgrades and wrong origins", async ({
  request,
  baseURL,
}) => {
  await request.post("/api/auth/login", {
    headers: { "x-csrf-protection": "1" },
    data: { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD },
  });
  const state = await request.storageState(),
    cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  for (const headers of [
    { origin: baseURL! },
    { cookie, origin: "https://evil.example" },
  ]) {
    const status = await new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(baseURL!.replace("http", "ws") + "/ws", {
        headers,
      });
      ws.on("unexpected-response", (_r, res) => {
        resolve(res.statusCode!);
        res.resume();
        ws.terminate();
      });
      ws.on("error", () => {});
      ws.on("open", () => {
        ws.close();
        reject(new Error("Unauthorized WS accepted"));
      });
    });
    expect([401, 403]).toContain(status);
  }
});
test("logout revokes an idle WebSocket without a viewer subscription", async ({
  request,
  baseURL,
}) => {
  const headers = { "x-csrf-protection": "1" };
  await request.post("/api/auth/login", {
    headers,
    data: { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD },
  });
  const state = await request.storageState(),
    cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const ws = new WebSocket(baseURL!.replace("http", "ws") + "/ws", {
    headers: { cookie, origin: baseURL! },
  });
  await once(ws, "open");
  const closed = once(ws, "close");
  await request.post("/api/auth/logout", { headers });
  const [code] = await closed;
  expect(code).toBe(1008);
});
test("attached JAD properties and per-instance save export/import reach the real emulator", async ({
  request,
}) => {
  const headers = { "x-csrf-protection": "1" };
  await request.post("/api/auth/login", {
    headers,
    data: { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD },
  });
  const games = await request.get("/api/games").then((r) => r.json());
  const game = games.find(
    (g: any) => g.manifest["MIDlet-Name"] === "Control Test",
  );
  const jad = await request.post(`/api/games/upload?gameId=${game.id}`, {
    headers,
    multipart: {
      file: {
        name: "test.jad",
        mimeType: "text/plain",
        buffer: Buffer.from(
          "MIDlet-Name: Control Test\nMIDlet-Jar-URL: test.jar\nControl-Test-Property: accepted\n",
        ),
      },
    },
  });
  expect(jad.ok()).toBe(true);
  const ids: string[] = [];
  try {
    for (const name of ["Save source", "Save target"]) {
      const i = await request.post("/api/instances", {
        headers,
        data: { name, gameId: game.id },
      });
      ids.push((await i.json()).id);
    }
    await request.post(`/api/instances/${ids[0]}/start`, { headers });
    await expect
      .poll(async () =>
        request
          .get(`/api/instances/${ids[0]}/logs`)
          .then((r) => r.json())
          .then((x) => x.text),
      )
      .toContain("TEST_JAD_PROPERTY accepted");
    await request.post(`/api/instances/${ids[0]}/stop`, { headers });
    const saves = await request
      .get(`/api/instances/${ids[0]}/saves`)
      .then((r) => r.json());
    expect(saves.files.some((f: any) => f.path.startsWith("rms/"))).toBe(true);
    expect(
      (
        await request.post(`/api/instances/${ids[1]}/saves`, {
          headers,
          data: saves,
        })
      ).ok(),
    ).toBe(true);
    const copied = await request
      .get(`/api/instances/${ids[1]}/saves`)
      .then((r) => r.json());
    expect(copied).toEqual(saves);
    await request.post(`/api/instances/${ids[1]}/start`, { headers });
    expect(
      (
        await request.post(`/api/instances/${ids[1]}/saves`, {
          headers,
          data: saves,
        })
      ).status(),
    ).toBe(409);
  } finally {
    for (const id of ids) {
      await request.post(`/api/instances/${id}/stop`, { headers });
      await request.delete(`/api/instances/${id}`, { headers });
    }
  }
});
test("WebSocket macro runs real key steps and cancels held input", async ({
  request,
  baseURL,
}) => {
  const headers = { "x-csrf-protection": "1" };
  await request.post("/api/auth/login", {
    headers,
    data: { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD },
  });
  const game = (await request.get("/api/games").then((r) => r.json())).find(
    (g: any) => g.manifest["MIDlet-Name"] === "Control Test",
  );
  const created = await request.post("/api/instances", {
    headers,
    data: { name: "Macro integration", gameId: game.id },
  });
  const id = (await created.json()).id;
  let ws: WebSocket | undefined;
  try {
    await request.post(`/api/instances/${id}/start`, { headers });
    const cookies = (await request.storageState()).cookies
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    ws = new WebSocket(baseURL!.replace("http", "ws") + "/ws", {
      headers: { cookie: cookies, origin: baseURL! },
    });
    await once(ws, "open");
    const states: string[] = [];
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === "macro") states.push(m.state);
    });
    ws.send(
      JSON.stringify({
        type: "macro",
        ids: [id],
        steps: [
          { key: "1", holdMs: 30, delayMs: 10 },
          { key: "2", holdMs: 30, delayMs: 10 },
        ],
      }),
    );
    await expect.poll(() => states.includes("completed")).toBe(true);
    ws.send(
      JSON.stringify({
        type: "macro",
        ids: [id],
        steps: [{ key: "OK", holdMs: 5000, delayMs: 0 }],
      }),
    );
    await expect
      .poll(async () =>
        request
          .get(`/api/instances/${id}/logs`)
          .then((r) => r.json())
          .then((v) => v.text),
      )
      .toContain("TEST_KEY -5 COUNT 3");
    ws.send(JSON.stringify({ type: "cancelMacro" }));
    await expect.poll(() => states.includes("cancelled")).toBe(true);
    await expect
      .poll(async () =>
        request
          .get(`/api/instances/${id}/logs`)
          .then((r) => r.json())
          .then((v) => v.text),
      )
      .toContain("TEST_RELEASE -5");
  } finally {
    ws?.close();
    await request.post(`/api/instances/${id}/stop`, { headers });
    await request.delete(`/api/instances/${id}`, { headers });
  }
});
