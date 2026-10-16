import { AppError } from "./errors.js";
export type PointerAction = "down" | "move" | "up";
export class PointerBroker {
  private held = new Map<string, { owner: object; x: number; y: number }>();
  private queue = Promise.resolve();
  constructor(
    private send: (
      id: string,
      action: PointerAction,
      x: number,
      y: number,
    ) => Promise<void>,
  ) {}
  private serial<T>(fn: () => Promise<T>) {
    const r = this.queue.then(fn);
    this.queue = r.then(
      () => {},
      () => {},
    );
    return r;
  }
  input(
    owner: object,
    id: string,
    action: PointerAction,
    x: number,
    y: number,
  ) {
    return this.serial(async () => {
      const held = this.held.get(id);
      if (held && held.owner !== owner)
        throw new AppError(409, "Another viewer is touching this screen");
      if (action === "down") {
        await this.send(id, action, x, y);
        this.held.set(id, { owner, x, y });
      } else if (held) {
        try {
          await this.send(id, action, x, y);
        } finally {
          if (action === "up") this.held.delete(id);
          else {
            held.x = x;
            held.y = y;
          }
        }
      }
    });
  }
  release(owner: object) {
    return this.serial(async () => {
      for (const [id, h] of this.held)
        if (h.owner === owner) {
          this.held.delete(id);
          await this.send(id, "up", h.x, h.y).catch(() => {});
        }
    });
  }
  reset(id: string) {
    return this.serial(async () => {
      this.held.delete(id);
    });
  }
}
