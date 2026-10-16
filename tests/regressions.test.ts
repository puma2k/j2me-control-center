import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../apps/api/src/store.js";
import { Library } from "../apps/api/src/library.js";
import { Manager } from "../apps/api/src/manager.js";
import { instanceInput } from "../packages/shared/schema.js";
import { crc32 } from "node:zlib";
test(
  "deleting game cannot race with synchronous instance creation and unlink referenced JAR",
  { skip: !existsSync(".cache/control-test.jar") },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "j2me-race-"));
    const store = new Store(join(dir, "db"));
    const library = new Library(store, join(dir, "games"));
    const manager = new Manager(
      store,
      () => {
        throw new Error("Unused");
      },
      { maxInstances: 5, memoryBudgetMb: 2048, streamFps: 10, quality: 75 },
    );
    try {
      const g = await library.upload(
        "test.jar",
        readFileSync(".cache/control-test.jar"),
      );
      const deletion = library.remove(g.id);
      assert.throws(() =>
        manager.create(instanceInput.parse({ name: "Race", gameId: g.id })),
      );
      await deletion;
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
test(
  "CRC corruption in ZIP contents is rejected",
  { skip: !existsSync(".cache/control-test.jar") },
  async () => {
    const jar = Buffer.from(readFileSync(".cache/control-test.jar"));
    let p = 0;
    while ((p = jar.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), p)) !== -1) {
      jar.writeUInt32LE(123, p + 16);
      p += 4;
    }
    const { inspectJar } = await import("../apps/api/src/library.js");
    await assert.rejects(inspectJar(jar));
    assert.equal(typeof crc32, "function");
  },
);
