import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { inspectJar, inspectJad } from "../apps/api/src/library.js";
// Generated from original, MIT-licensed source using the pinned emulator's API.
test(
  "legal compiled fixture is a valid MIDlet archive",
  { skip: !existsSync(".cache/control-test.jar") },
  async () => {
    const manifest = await inspectJar(readFileSync(".cache/control-test.jar"));
    assert.equal(manifest["MIDlet-Name"], "Control Test");
    assert.equal(manifest["MIDlet-1"], "Control Test,,ControlTest");
  },
);
test("JAD rejects binary input, remote URLs, traversal, and missing JAR", () => {
  for (const text of [
    "MIDlet-Jar-URL: /etc/passwd",
    "MIDlet-Jar-URL: ..\\game.jar",
    "MIDlet-Name: X",
    "MIDlet-Jar-URL: file:///tmp/game.jar",
    "MIDlet-Jar-URL: x.jar\u0000",
  ])
    assert.throws(() => inspectJad(Buffer.from(text)));
});

test("slow hosts can configure bounded startup timeout instead of a fixed 30s cutoff", async () => {
  const runtime = await import("../runtime/freej2me.js");
  assert.equal(runtime.startupTimeoutMs("120"), 120000);
  assert.throws(() => runtime.startupTimeoutMs("NaN"));
  assert.throws(() => runtime.startupTimeoutMs("301"));
});
