import { setTimeout as sleep } from "node:timers/promises";
import type { Key } from "../../../packages/shared/schema.js";
export class InputBroker {
  private queue = Promise.resolve();
  private held = new Map<
    string,
    { id: string; key: Key; owners: Set<object> }
  >();
  constructor(
    private send: (id: string, key: Key, down: boolean) => Promise<void>,
  ) {}
  private serial<T>(fn: () => Promise<T>) {
    const result = this.queue.then(fn);
    this.queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  key(owner: object, id: string, key: Key, down: boolean) {
    return this.serial(async () => {
      const code = `${id}:${key}`,
        held = this.held.get(code);
      if (down) {
        if (held?.owners.has(owner)) return;
        if (!held) {
          await this.send(id, key, true);
          this.held.set(code, { id, key, owners: new Set([owner]) });
        } else held.owners.add(owner);
      } else if (held?.owners.has(owner)) {
        held.owners.delete(owner);
        if (!held.owners.size) {
          this.held.delete(code);
          await this.send(id, key, false);
        }
      }
    });
  }
  reset(id: string) {
    return this.serial(async () => {
      for (const [code, held] of this.held)
        if (held.id === id) this.held.delete(code);
    });
  }
  release(owner: object) {
    return this.serial(async () => {
      for (const [code, held] of this.held) {
        if (!held.owners.delete(owner)) continue;
        if (!held.owners.size) {
          this.held.delete(code);
          await this.send(held.id, held.key, false).catch(() => {});
        }
      }
    });
  }
}
export type MacroStep = { key: Key; holdMs: number; delayMs: number };
export class MacroRunner {
  private controller?: AbortController;
  private running?: Promise<void>;
  constructor(
    private broker: InputBroker,
    private report: (state: string, error?: string) => void,
  ) {}
  start(ids: string[], steps: MacroStep[]): Promise<void> {
    if (this.running) throw new Error("Cancel the running macro first");
    const controller = new AbortController(),
      owner = {};
    this.controller = controller;
    this.report("started");
    this.running = (async () => {
      try {
        for (const step of steps) {
          if (controller.signal.aborted) break;
          for (const id of ids)
            await this.broker.key(owner, id, step.key, true);
          await sleep(step.holdMs, undefined, { signal: controller.signal });
          for (const id of ids)
            await this.broker.key(owner, id, step.key, false);
          await sleep(step.delayMs, undefined, { signal: controller.signal });
        }
        this.report(controller.signal.aborted ? "cancelled" : "completed");
      } catch (e) {
        this.report(
          controller.signal.aborted ? "cancelled" : "failed",
          controller.signal.aborted ? undefined : String(e),
        );
      } finally {
        await this.broker.release(owner);
        this.running = undefined;
        this.controller = undefined;
      }
    })();
    return this.running;
  }
  async cancel() {
    this.controller?.abort();
    await this.running;
  }
}
