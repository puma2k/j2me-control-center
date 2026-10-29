import type { Key } from "../../../packages/shared/schema.js";
/** Each pointer owns its chord; shared directions stay down until all owners lift. */
export class TouchKeys {
  private owners = new Map<number, Key[]>();
  constructor(private send: (key: Key, down: boolean) => void) {}
  press(pointer: number, keys: Key[]) {
    this.release(pointer);
    for (const key of keys) {
      if (![...this.owners.values()].some((held) => held.includes(key)))
        this.send(key, true);
    }
    this.owners.set(pointer, keys);
  }
  release(pointer: number) {
    const keys = this.owners.get(pointer) ?? [];
    this.owners.delete(pointer);
    for (const key of keys) {
      if (![...this.owners.values()].some((held) => held.includes(key)))
        this.send(key, false);
    }
  }
  releaseAll() {
    for (const pointer of [...this.owners.keys()]) this.release(pointer);
  }
}
