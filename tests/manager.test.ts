import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../apps/api/src/store.js";
import { Manager } from "../apps/api/src/manager.js";
import { instanceInput } from "../packages/shared/schema.js";
import type { EmulatorAdapter } from "../runtime/adapter.js";
class Fake implements EmulatorAdapter {
  running = false;
  starts = 0;
  onExit = () => {};
  async start() {
    this.starts++;
    await new Promise((r) => setTimeout(r, 5));
    this.running = true;
  }
  async stop() {
    this.running = false;
  }
  async restart() {
    await this.stop();
    await this.start();
  }
  async sendKey() {}
  async captureFrame() {
    return Buffer.alloc(0);
  }
  getStatus() {
    return this.running ? ("running" as const) : ("stopped" as const);
  }
  async getLogs() {
    return "";
  }
  async getMetrics() {
    return { pid: 123, cpuPercent: 0, rssMb: 1, uptimeSeconds: 1 };
  }
}
test("serialized lifecycle enforces quota under concurrent starts and permits idempotent start/stop", async () => {
  const dir = mkdtempSync(join(tmpdir(), "j2me-manager-")),
    s = new Store(join(dir, "db"));
  s.putGame({
    id: "a".repeat(64),
    name: "test",
    version: "1",
    vendor: "x",
    filename: "x.jar",
    createdAt: 1,
    manifest: {},
  });
  const fakes: Fake[] = [];
  const m = new Manager(
    s,
    () => {
      const f = new Fake();
      fakes.push(f);
      return f;
    },
    { maxInstances: 1, memoryBudgetMb: 2048, streamFps: 10, quality: 70 },
  );
  try {
    const a = m.create(
      instanceInput.parse({ gameId: "a".repeat(64), name: "one" }),
    );
    const b = m.create(
      instanceInput.parse({ gameId: "a".repeat(64), name: "two" }),
    );
    const result = await Promise.allSettled([m.start(a.id), m.start(b.id)]);
    assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
    await Promise.all([m.start(a.id), m.start(a.id)]);
    assert.equal(fakes[0].starts, 1);
    await Promise.all([m.stop(a.id), m.stop(a.id)]);
    assert.equal(s.instance(a.id)?.status, "stopped");
    await m.start(b.id);
    assert.equal(s.instance(b.id)?.status, "running");
    await assert.rejects(m.remove(b.id));
  } finally {
    await m.shutdown();
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("reconcile resets stale running metadata and only restores opted-in instances", async () => {
  const dir = mkdtempSync(join(tmpdir(), "j2me-reconcile-")),
    s = new Store(join(dir, "db"));
  s.putGame({
    id: "a".repeat(64),
    name: "test",
    version: "1",
    vendor: "x",
    filename: "x.jar",
    createdAt: 1,
    manifest: {},
  });
  const m = new Manager(s, () => new Fake(), {
    maxInstances: 5,
    memoryBudgetMb: 2048,
    streamFps: 10,
    quality: 70,
  });
  try {
    const a = m.create(
      instanceInput.parse({ gameId: "a".repeat(64), name: "manual" }),
    );
    s.putInstance({ ...a, status: "running" });
    const b = m.create(
      instanceInput.parse({
        gameId: "a".repeat(64),
        name: "auto",
        restartPolicy: "restore-running",
      }),
    );
    s.putInstance({ ...b, status: "running" });
    await m.reconcile();
    assert.equal(s.instance(a.id)?.status, "stopped");
    assert.equal(s.instance(b.id)?.status, "running");
  } finally {
    await m.shutdown();
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
