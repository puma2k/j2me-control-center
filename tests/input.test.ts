import { test } from "node:test";
import assert from "node:assert/strict";
import { InputBroker, MacroRunner } from "../apps/api/src/input.js";
import { setTimeout as sleep } from "node:timers/promises";
test("two viewers pressing concurrently share ownership and release only after the last owner", async () => {
  const calls: string[] = [];
  const broker = new InputBroker(async (id, key, down) => {
    await sleep(2);
    calls.push(`${id}:${key}:${down}`);
  });
  const a = {},
    b = {};
  await Promise.all([
    broker.key(a, "id", "OK", true),
    broker.key(b, "id", "OK", true),
  ]);
  assert.deepEqual(calls, ["id:OK:true"]);
  await broker.release(a);
  assert.equal(calls.length, 1);
  await broker.release(b);
  assert.deepEqual(calls, ["id:OK:true", "id:OK:false"]);
});
test("cancel macro releases its keys while preserving manually held keys", async () => {
  const calls: string[] = [];
  const broker = new InputBroker(async (id, key, down) => {
    calls.push(`${key}:${down}`);
  });
  const manual = {};
  await broker.key(manual, "id", "OK", true);
  const states: string[] = [];
  const macro = new MacroRunner(broker, (s) => states.push(s));
  macro.start(["id"], [{ key: "OK", holdMs: 1000, delayMs: 0 }]);
  await sleep(10);
  await macro.cancel();
  assert.deepEqual(calls, ["OK:true"]);
  await broker.release(manual);
  assert.deepEqual(calls, ["OK:true", "OK:false"]);
  assert.ok(states.includes("cancelled"));
});
test("macro executes press/release steps and reports completion", async () => {
  const calls: boolean[] = [];
  const broker = new InputBroker(async (_id, _key, down) => {
    calls.push(down);
  });
  const macro = new MacroRunner(broker, () => {});
  await macro.start(
    ["id"],
    [
      { key: "1", holdMs: 1, delayMs: 1 },
      { key: "2", holdMs: 1, delayMs: 0 },
    ],
  );
  assert.deepEqual(calls, [true, false, true, false]);
});
test("runtime replacement clears old owners so a new viewer sends DOWN to the new JVM", async () => {
  const calls: boolean[] = [];
  const broker = new InputBroker(async (_id, _key, down) => {
    calls.push(down);
  });
  const a = {},
    b = {};
  await broker.key(a, "id", "OK", true);
  await broker.reset("id");
  await broker.key(b, "id", "OK", true);
  await broker.release(a);
  assert.deepEqual(calls, [true, true]);
  await broker.release(b);
  assert.deepEqual(calls, [true, true, false]);
});
