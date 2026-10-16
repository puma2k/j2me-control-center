import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  instanceInput,
  keyCodes,
  messageInput,
} from "../packages/shared/schema.js";
import {
  parseProperties,
  inspectJar,
  inspectJad,
} from "../apps/api/src/library.js";
import { Store } from "../apps/api/src/store.js";

test("instance settings reject unsafe and excessive resource values", () => {
  assert.equal(
    instanceInput.safeParse({ gameId: "../bad", name: "x" }).success,
    false,
  );
  assert.equal(
    instanceInput.safeParse({ gameId: "a".repeat(64), name: "x", heapMb: 9000 })
      .success,
    false,
  );
  assert.equal(
    instanceInput.safeParse({ gameId: "a".repeat(64), name: "x", width: 9999 })
      .success,
    false,
  );
  assert.equal(
    instanceInput.parse({ gameId: "a".repeat(64), name: "x" }).heapMb,
    128,
  );
});
test("key protocol accepts only bounded supported keys and commands", () => {
  assert.equal(keyCodes.UP, -1);
  assert.equal(
    messageInput.safeParse({
      type: "key",
      ids: ["x"],
      key: "; rm -rf /",
      down: true,
    }).success,
    false,
  );
  assert.equal(
    messageInput.safeParse({ type: "subscribe", ids: Array(101).fill("x") })
      .success,
    false,
  );
});
test("manifest continuation lines and JAD URL restrictions", () => {
  assert.equal(
    parseProperties("MIDlet-Name: Test\r\n continued\r\n").get("MIDlet-Name"),
    "Testcontinued",
  );
  assert.throws(() =>
    inspectJad(Buffer.from("MIDlet-Jar-URL: http://evil/game.jar")),
  );
  assert.throws(() =>
    inspectJad(Buffer.from("MIDlet-Jar-URL: ../../game.jar")),
  );
  assert.equal(
    inspectJad(Buffer.from("MIDlet-Jar-URL: game.jar\nMIDlet-Name: Good")).name,
    "Good",
  );
});
test("invalid ZIP and non MIDlet JAR are rejected", async () => {
  await assert.rejects(inspectJar(Buffer.from("not a zip")));
});
test("SQLite sessions and game metadata survive reopening; versioned migrations", () => {
  const dir = mkdtempSync(join(tmpdir(), "j2me-store-"));
  try {
    let s = new Store(join(dir, "db.sqlite"));
    s.putGame({
      id: "a".repeat(64),
      name: "Test",
      version: "1",
      vendor: "me",
      filename: "test.jar",
      createdAt: 1,
      manifest: {},
    });
    s.close();
    s = new Store(join(dir, "db.sqlite"));
    assert.equal(s.games()[0].name, "Test");
    assert.equal(s.db.pragma("user_version", { simple: true }), 1);
    assert.equal(s.db.pragma("journal_mode", { simple: true }), "wal");
    s.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pointer protocol validates action and bounded integer coordinates", () => {
  assert.equal(
    messageInput.safeParse({
      type: "pointer",
      id: "phone",
      action: "down",
      x: 120,
      y: 250,
    }).success,
    true,
  );
  for (const change of [
    { x: -1 },
    { x: 1.5 },
    { y: 10000 },
    { action: "shell" },
  ])
    assert.equal(
      messageInput.safeParse({
        type: "pointer",
        id: "phone",
        action: "down",
        x: 120,
        y: 250,
        ...change,
      }).success,
      false,
    );
});

test("text input accepts Unicode and backspace but bounds payloads", () => {
  const id = "3e8db074-006b-4185-b8e0-0ac88c15809e";
  assert.equal(
    messageInput.safeParse({
      type: "text",
      id,
      text: "Xin chào 123",
      backspace: 0,
    }).success,
    true,
  );
  assert.equal(
    messageInput.safeParse({ type: "text", id, text: "", backspace: 1 })
      .success,
    true,
  );
  for (const value of [
    { text: "x".repeat(257), backspace: 0 },
    { text: "a\nSTOP", backspace: 0 },
    { text: "", backspace: 257 },
  ])
    assert.equal(
      messageInput.safeParse({ type: "text", id, ...value }).success,
      false,
    );
});
