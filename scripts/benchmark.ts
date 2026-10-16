import { WebSocket } from "ws";
import { once } from "node:events";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const base =
  process.env.TEST_BASE_URL || `http://127.0.0.1:${env.PORT || 3000}`;
let cookie = "";
async function request(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      cookie,
      "x-csrf-protection": "1",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (path === "/auth/login")
    cookie = res.headers.get("set-cookie")!.split(";")[0];
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<any>;
}
await request("/auth/login", {
  username: env.ADMIN_USERNAME,
  password: env.ADMIN_PASSWORD,
});
const games = await request("/games");
const game = games.find(
  (g: any) => g.manifest["MIDlet-Name"] === "Control Test",
);
if (!game) throw new Error("Upload .cache/control-test.jar first");
const counts = (process.env.BENCH_COUNTS || "1,5").split(",").map(Number),
  duration = Number(process.env.BENCH_SECONDS || 15),
  rows: any[] = [];
for (const n of counts) {
  const created: string[] = [];
  let ws: WebSocket | undefined;
  try {
    for (let j = 0; j < n; j++) {
      const i = await request("/instances", {
        gameId: game.id,
        name: `Benchmark ${n}/${j + 1}`,
        fps: 30,
        heapMb: 128,
      });
      created.push(i.id);
      await request(`/instances/${i.id}/start`, {});
    }
    ws = new WebSocket(base.replace("http", "ws") + "/ws", {
      headers: { cookie, origin: base },
    });
    await once(ws, "open");
    const frameCounts: Record<string, number> = {};
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === "frame") frameCounts[m.id] = (frameCounts[m.id] || 0) + 1;
    });
    ws.send(
      JSON.stringify({
        type: "subscribe",
        ids: created.slice(0, 9),
        fps: 10,
        quality: 75,
      }),
    );
    const start = Date.now();
    let count = 0,
      cpuSum = 0,
      rssSum = 0,
      latencySum = 0,
      latencyMax = 0,
      stable = true,
      firstHost: any;
    let rssStartMb = 0,
      rssEndMb = 0,
      rssMaxMb = 0;
    while (Date.now() - start < duration * 1000) {
      const data = await request("/metrics/summary");
      firstHost ??= data.host;
      const values = data.instances.filter((i: any) => created.includes(i.id));
      const cpu = values.reduce(
          (sum: number, i: any) => sum + (i.cpuPercent || 0),
          0,
        ),
        rss = values.reduce((sum: number, i: any) => sum + (i.rssMb || 0), 0);
      cpuSum += cpu;
      rssSum += rss;
      stable =
        stable && values.length === n && values.every((i: any) => i.pid > 0);
      if (count === 0) rssStartMb = rss;
      rssEndMb = rss;
      rssMaxMb = Math.max(rssMaxMb, rss);
      const t = Date.now(),
        frame = await fetch(`${base}/api/instances/${created[0]}/screenshot`, {
          headers: { cookie },
        });
      if (!frame.ok) throw new Error("Screenshot failed");
      await frame.arrayBuffer();
      const latency = Date.now() - t;
      latencySum += latency;
      latencyMax = Math.max(latencyMax, latency);
      count++;
      if (process.env.BENCH_SAMPLES_OUTPUT)
        appendFileSync(
          process.env.BENCH_SAMPLES_OUTPUT,
          JSON.stringify({
            at: Date.now(),
            instances: n,
            cpuPercent: cpu,
            rssMb: rss,
            hostFreeMb: data.host.freeMemoryMb,
            captureMs: latency,
          }) + "\n",
        );
      await sleep(1000);
    }
    rows.push({
      instances: n,
      durationSeconds: (Date.now() - start) / 1000,
      samples: count,
      meanCpuPercent: cpuSum / count,
      meanRssMb: rssSum / count,
      rssStartMb,
      rssEndMb,
      rssMaxMb,
      screenshotMeanMs: latencySum / count,
      screenshotMaxMs: latencyMax,
      host: firstHost,
      viewedInstances: Math.min(9, n),
      requestedStreamFps: 10,
      actualStreamFpsPerViewer: Object.values(frameCounts).map(
        (v) => v / ((Date.now() - start) / 1000),
      ),
      frameCounts,
      stability: stable,
    });
  } finally {
    ws?.close();
    for (const id of created) {
      await request(`/instances/${id}/stop`, {}).catch(() => {});
      await request(`/instances/${id}`, undefined, "DELETE").catch(() => {});
    }
  }
  console.log(JSON.stringify(rows.at(-1)));
}
writeFileSync(
  process.env.BENCH_OUTPUT || ".cache/benchmark.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      rows,
    },
    null,
    2,
  ),
);
