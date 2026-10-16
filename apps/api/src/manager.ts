import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { Store } from "./store.js";
import type {
  AdapterFactory,
  EmulatorAdapter,
} from "../../../runtime/adapter.js";
import type {
  Instance,
  InstanceConfig,
  Key,
  Settings,
  Status,
} from "../../../packages/shared/schema.js";
import { AppError } from "./errors.js";
export class Manager extends EventEmitter {
  readonly adapters = new Map<string, EmulatorAdapter>();
  private queue = Promise.resolve();
  private shuttingDown = false;
  private retries = new Map<string, number>();
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(
    readonly store: Store,
    readonly factory: AdapterFactory,
    public settings: Settings,
  ) {
    super();
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn);
    this.queue = next.then(
      () => {},
      () => {},
    );
    return next;
  }
  get(id: string) {
    const i = this.store.instance(id);
    if (!i) throw new AppError(404, "Instance not found");
    return i;
  }
  create(config: InstanceConfig) {
    if (!this.store.game(config.gameId))
      throw new AppError(404, "Game not found");
    if (this.store.instances().length >= 1000)
      throw new AppError(409, "Metadata capacity reached");
    const i: Instance = {
      ...config,
      id: randomUUID(),
      status: "created",
      createdAt: Date.now(),
      error: null,
      startedAt: null,
    };
    this.store.putInstance(i);
    this.store.event("instance.create", { id: i.id });
    this.emit("state", i);
    return i;
  }
  private state(i: Instance, status: Status, error: string | null = null) {
    const updated = {
      ...i,
      status,
      error,
      startedAt: status === "running" ? Date.now() : i.startedAt,
    };
    this.store.putInstance(updated);
    this.emit("state", updated);
    return updated;
  }
  start(id: string) {
    return this.serial(() => this.startNow(id));
  }
  private async startNow(id: string) {
    if (this.shuttingDown) throw new AppError(503, "Server shutting down");
    const i = this.get(id);
    if (i.status === "running") return i;
    const active = this.store
      .instances()
      .filter((v) => ["starting", "running", "stopping"].includes(v.status));
    if (
      active.length >= this.settings.maxInstances ||
      active.reduce((n, v) => n + v.heapMb + 128, 0) + i.heapMb + 128 >
        this.settings.memoryBudgetMb
    )
      throw new AppError(409, "Capacity exceeded: instance or memory quota");
    this.state(i, "starting");
    const a = this.factory(i);
    this.adapters.set(id, a);
    a.onExit = (reason) => {
      void this.serial(async () => {
        if (this.adapters.get(id) !== a || this.get(id).status !== "running")
          return;
        this.state(this.get(id), "failed", reason);
        await a.stop();
        this.adapters.delete(id);
        this.store.event("instance.crash", { id, reason });
        const attempts = this.retries.get(id) || 0;
        if (
          i.restartPolicy === "restore-running" &&
          !this.shuttingDown &&
          attempts < 2
        ) {
          this.retries.set(id, attempts + 1);
          this.retryTimers.set(
            id,
            setTimeout(
              () => {
                this.retryTimers.delete(id);
                void this.start(id).catch((e) =>
                  this.store.event("instance.retry-failed", {
                    id,
                    error: String(e),
                  }),
                );
              },
              1000 * 2 ** attempts,
            ),
          );
        }
      }).catch(() => {});
    };
    try {
      await a.start();
      this.store.event("instance.start", { id });
      return this.state(i, "running");
    } catch (e) {
      await a.stop().catch(() => {});
      this.adapters.delete(id);
      this.state(i, "failed", String(e));
      throw new AppError(422, `Emulator failed: ${String(e)}`);
    }
  }
  stop(id: string) {
    return this.serial(() => this.stopNow(id));
  }
  private async stopNow(id: string, preserve = false) {
    const i = this.get(id);
    clearTimeout(this.retryTimers.get(id));
    this.retryTimers.delete(id);
    this.retries.delete(id);
    const a = this.adapters.get(id);
    if (!a) {
      return this.state(i, "stopped");
    }
    this.state(i, "stopping");
    await a.stop();
    this.adapters.delete(id);
    this.store.event("instance.stop", { id });
    const stopped = this.state(i, "stopped");
    if (preserve) this.store.putInstance({ ...stopped, status: i.status });
    return stopped;
  }
  withStopped<T>(id: string, fn: () => Promise<T>) {
    return this.serial(async () => {
      const i = this.get(id);
      if (["running", "starting", "stopping"].includes(i.status))
        throw new AppError(409, "Stop instance before managing saves");
      return fn();
    });
  }
  restart(id: string) {
    return this.serial(async () => {
      await this.stopNow(id);
      return this.startNow(id);
    });
  }
  patch(id: string, patch: Partial<InstanceConfig>) {
    return this.serial(async () => {
      const i = this.get(id);
      if (["running", "starting", "stopping"].includes(i.status))
        throw new AppError(409, "Stop instance before changing configuration");
      const updated = { ...i, ...patch };
      this.store.putInstance(updated);
      this.emit("state", updated);
      return updated;
    });
  }
  remove(id: string) {
    return this.serial(async () => {
      const i = this.get(id);
      if (["running", "starting", "stopping"].includes(i.status))
        throw new AppError(409, "Stop instance before deleting");
      clearTimeout(this.retryTimers.get(id));
      this.store.deleteInstance(id);
      this.emit("deleted", id);
      this.store.event("instance.delete", { id });
      return { ok: true };
    });
  }
  async pointer(
    id: string,
    action: "down" | "move" | "up",
    x: number,
    y: number,
  ) {
    const i = this.get(id),
      a = this.adapters.get(id);
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x >= i.width ||
      y >= i.height
    )
      throw new AppError(400, "Pointer outside screen");
    if (!a?.sendPointer)
      throw new AppError(409, "Runtime does not support pointer input");
    await a.sendPointer(action, x, y);
  }
  async text(id: string, text: string, backspace: number) {
    this.get(id);
    const a = this.adapters.get(id);
    if (!a?.sendText)
      throw new AppError(409, "Instance does not support text input");
    await a.sendText(text, backspace);
  }
  async key(id: string, key: Key, down: boolean) {
    this.get(id);
    const a = this.adapters.get(id);
    if (!a) throw new AppError(409, "Instance not running");
    await a.sendKey(key, down);
  }
  async reconcile() {
    const restore: string[] = [];
    for (const i of this.store.instances()) {
      if (["running", "starting", "stopping"].includes(i.status)) {
        this.state(i, "stopped");
        if (i.restartPolicy === "restore-running" && i.status !== "stopping")
          restore.push(i.id);
      }
    }
    for (const id of restore)
      await this.start(id).catch((e) => {
        this.state(this.get(id), "failed", String(e));
      });
  }
  async shutdown() {
    this.shuttingDown = true;
    for (const t of this.retryTimers.values()) clearTimeout(t);
    this.retryTimers.clear();
    await this.serial(async () => {
      for (const id of this.adapters.keys()) await this.stopNow(id, true);
    });
  }
}
