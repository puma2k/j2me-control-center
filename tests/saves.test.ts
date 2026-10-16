import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  mkdir,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportSaves, importSaves } from "../apps/api/src/saves.js";
test("save exports stay per-instance and imports replace only RMS/config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "j2me-saves-"));
  try {
    const a = join(dir, "a"),
      b = join(dir, "b");
    await mkdir(join(a, "rms"), { recursive: true });
    await mkdir(b);
    await writeFile(join(a, "rms", "record.bin"), "first");
    await writeFile(join(b, "runtime.log"), "keep");
    const data = await exportSaves(a);
    await importSaves(b, data);
    assert.equal(await readFile(join(b, "rms", "record.bin"), "utf8"), "first");
    assert.equal(await readFile(join(b, "runtime.log"), "utf8"), "keep");
    await writeFile(join(a, "rms", "record.bin"), "second");
    assert.equal(await readFile(join(b, "rms", "record.bin"), "utf8"), "first");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("save import rejects traversal, duplicates, invalid base64 and files outside allowed roots", async () => {
  const dir = await mkdtemp(join(tmpdir(), "j2me-save-unsafe-"));
  try {
    for (const files of [
      [{ path: "../outside", data: "YQ==" }],
      [{ path: "runtime.log", data: "YQ==" }],
      [
        { path: "rms/a", data: "YQ==" },
        { path: "rms/a", data: "Yg==" },
      ],
      [{ path: "rms/a", data: "invalid!!" }],
    ])
      await assert.rejects(importSaves(dir, { version: 1, files }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("save export excludes symlinks outside instance storage", async () => {
  const dir = await mkdtemp(join(tmpdir(), "j2me-save-link-"));
  try {
    await mkdir(join(dir, "rms"));
    await symlink("/etc/passwd", join(dir, "rms", "link"));
    const data = await exportSaves(dir);
    assert.equal(data.files.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("large valid base64 and Unicode filenames roundtrip within the advertised save quota", async () => {
  const dir = await mkdtemp(join(tmpdir(), "j2me-save-large-"));
  try {
    const data = Buffer.alloc(7_500_000, 7);
    await importSaves(dir, {
      version: 1,
      files: [{ path: "rms/large.bin", data: data.toString("base64") }],
    });
    await importSaves(dir, {
      version: 1,
      files: [{ path: "rms/日本語/tệp.bin", data: data.toString("base64") }],
    });
    const exported = await exportSaves(dir);
    assert.equal(exported.files[0].path, "rms/日本語/tệp.bin");
    assert.equal(exported.files[0].data, data.toString("base64"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
