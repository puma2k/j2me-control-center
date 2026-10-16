import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
let cookie = "";
const base = "http://127.0.0.1:3000";
async function api(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<any> {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      cookie,
      "x-csrf-protection": "1",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (path === "/auth/login")
    cookie = r.headers.get("set-cookie")!.split(";")[0];
  if (!r.ok) throw new Error(`${path}: ${await r.text()}`);
  return r.json();
}
async function wait<T>(fn: () => Promise<T>, check: (v: T) => boolean) {
  for (let i = 0; i < 60; i++) {
    try {
      const v = await fn();
      if (check(v)) return v;
    } catch {}
    await sleep(500);
  }
  throw new Error("Timed out");
}
await api("/auth/login", {
  username: env.ADMIN_USERNAME,
  password: env.ADMIN_PASSWORD,
});
const game = (await api("/games")).find(
  (g: any) => g.manifest["MIDlet-Name"] === "Control Test",
);
const ids: string[] = [];
const checks: string[] = [];
try {
  for (const policy of ["manual", "restore-running"]) {
    const i = await api("/instances", {
      gameId: game.id,
      name: `Recovery test ${policy}`,
      restartPolicy: policy,
    });
    ids.push(i.id);
    await api(`/instances/${i.id}/start`, {});
  }
  const crashed = await api(`/instances/${ids[1]}/metrics`);
  if (!Number.isSafeInteger(crashed.pid)) throw new Error("Missing PID");
  execFileSync("docker", [
    "compose",
    "exec",
    "-T",
    "api",
    "node",
    "-e",
    `process.kill(${crashed.pid}, 'SIGKILL')`,
  ]);
  const recovered = await wait(
    () => api(`/instances/${ids[1]}/metrics`),
    (m: any) => m.pid && m.pid !== crashed.pid,
  );
  checks.push(`Unexpected JVM exit recovered with new PID ${recovered.pid}`);
  execFileSync("docker", ["compose", "restart", "api"], { stdio: "pipe" });
  await wait(
    () => api("/health"),
    (v) => v.ok,
  );
  const restored = await wait(
    () => api(`/instances/${ids[1]}`),
    (i) => i.status === "running",
  );
  const manual = await api(`/instances/${ids[0]}`);
  if (manual.status !== "stopped")
    throw new Error("Manual policy incorrectly restored");
  checks.push(
    "Container restart preserves metadata; restores only restore-running instance",
  );
  const processList = execFileSync("docker", ["compose", "top", "api"], {
    encoding: "utf8",
  });
  const jvms = processList.split("\n").filter((l) => l.includes(" Bridge "));
  if (jvms.length !== 1)
    throw new Error(`Unexpected JVM count after restart: ${jvms.length}`);
  checks.push("Exactly one JVM after container restart, no orphan game JVM");
  await api(`/instances/${ids[1]}/stop`, {});
  const saves = await api(`/instances/${ids[1]}/saves`);
  if (!saves.files.length) throw new Error("Missing RMS save");
  execFileSync("bash", ["scripts/backup.sh", ".cache/recovery-backup"], {
    stdio: "pipe",
  });
  await wait(
    () => api("/health"),
    (v) => v.ok,
  );
  const originalName = game.name;
  await api(`/games/${game.id}`, { name: "Backup canary rename" }, "PATCH");
  await api(`/instances/${ids[1]}`, undefined, "DELETE");
  execFileSync(
    "bash",
    ["scripts/restore.sh", ".cache/recovery-backup/control-center.tar.gz"],
    { stdio: "pipe" },
  );
  await wait(
    () => api("/health"),
    (v) => v.ok,
  );
  if ((await api(`/games/${game.id}`)).name !== originalName)
    throw new Error("Database backup not restored");
  if (
    JSON.stringify(await api(`/instances/${ids[1]}/saves`)) !==
    JSON.stringify(saves)
  )
    throw new Error("Save backup not restored");
  checks.push(
    "Backup/restore roundtrip restores deleted instance, original metadata and RMS/config bytes",
  );
  writeFileSync(
    ".cache/recovery-verification.json",
    JSON.stringify({ at: new Date().toISOString(), checks }, null, 2),
  );
  console.log(checks.join("\n"));
} finally {
  for (const id of ids) {
    await api(`/instances/${id}/stop`, {}).catch(() => {});
    await api(`/instances/${id}`, undefined, "DELETE").catch(() => {});
  }
}
