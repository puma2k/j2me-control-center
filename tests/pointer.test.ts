import { test } from "node:test";
import assert from "node:assert/strict";
import { PointerBroker } from "../apps/api/src/pointer.js";
test("pointer ownership prevents competing viewers and releases at last coordinates on disconnect", async () => {
  const calls: unknown[] = [];
  const p = new PointerBroker(async (...args) => {
    calls.push(args);
  });
  const a = {},
    b = {};
  await p.input(a, "phone", "down", 20, 30);
  await assert.rejects(p.input(b, "phone", "down", 50, 60));
  await p.input(a, "phone", "move", 25, 35);
  await p.release(a);
  assert.deepEqual(calls, [
    ["phone", "down", 20, 30],
    ["phone", "move", 25, 35],
    ["phone", "up", 25, 35],
  ]);
  await p.input(b, "phone", "down", 10, 10);
  await p.reset("phone");
  await p.release(b);
  assert.equal(calls.length, 4);
});
