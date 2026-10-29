import { FreeJ2ME } from "/app/dist/runtime/freej2me.js";
import { mkdir, copyFile } from "node:fs/promises";
import assert from "node:assert/strict";
await mkdir("/tmp/editor-games", { recursive: true });
await copyFile(
  "/opt/fixtures/control-test.jar",
  "/tmp/editor-games/fixture.jar",
);
const adapter = new FreeJ2ME(
  {
    id: "fixture",
    gameId: "fixture",
    width: 240,
    height: 320,
    fps: 60,
    profile: "Nokia",
    heapMb: 128,
  },
  "/tmp/editor-state",
  "/tmp/editor-games",
  "/emulator",
  97,
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await adapter.start();
  assert.equal(await adapter.getTextEditor(), null);
  await adapter.sendKey("0", true);
  await adapter.sendKey("0", false);
  await sleep(250);
  const editor = await adapter.getTextEditor();
  assert.equal(editor.title, "Native text");
  await adapter.setTextEditor(editor.token, "hello-fixture");
  assert.equal((await adapter.getTextEditor()).text, "hello-fixture");
  assert.ok(!(await adapter.getLogs()).includes("aGVsbG8tZml4dHVyZQ=="));
  await assert.rejects(adapter.setTextEditor("deadbeef", "wrong"));
  await adapter.setTextEditor(editor.token, "");
  assert.equal((await adapter.getTextEditor()).text, "");
  assert.equal((await adapter.captureRaw()).data.length, 240 * 320 * 3);
  await adapter.sendKey("OK", true);
  await adapter.sendKey("OK", false);
  await sleep(250);
  assert.equal(await adapter.getTextEditor(), null);
  await adapter.sendKey("#", true);
  await adapter.sendKey("#", false);
  await sleep(250);
  await adapter.captureRaw();
  const form = await adapter.getTextEditor();
  assert.equal(form.title, "Native field");
  const text = "Xin chào 12";
  await adapter.setTextEditor(form.token, text);
  assert.equal((await adapter.getTextEditor()).text, text);
  await adapter.sendKey("OK", true);
  await adapter.sendKey("OK", false);
  await sleep(250);
  assert.ok(
    (await adapter.getLogs()).includes(
      "TEST_NATIVE_TEXT " + Buffer.from(text).toString("base64"),
    ),
  );
  await adapter.sendKey("9", true);
  await adapter.sendKey("9", false);
  await sleep(250);
  await adapter.captureRaw();
  await adapter.sendPointer("down", 60, 44);
  await adapter.sendPointer("up", 60, 44);
  await sleep(250);
  assert.ok(
    (await adapter.getLogs()).includes("TEST_LIST_SELECTED 1"),
    "Touch must activate the second native list row",
  );
  console.log(
    "NATIVE_ADAPTER_PASS: protocol parsing, replacement, empty value, stale rejection, no protocol text logs, raw frames, Form Unicode editing, native List touch",
  );
} finally {
  await adapter.stop();
}
