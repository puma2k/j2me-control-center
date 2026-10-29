import test from "node:test";
import assert from "node:assert/strict";
import { TouchKeys } from "../apps/web/src/touch-controls.js";
test("two fingers sharing a direction do not release each other's held key", () => {
  const events: string[] = [];
  const keys = new TouchKeys((key, down) => events.push(`${key}:${down}`));
  keys.press(1, ["UP", "LEFT"]);
  keys.press(2, ["UP"]);
  keys.release(1);
  assert.deepEqual(events, ["UP:true", "LEFT:true", "LEFT:false"]);
  keys.releaseAll();
  keys.release(2);
  assert.deepEqual(events, ["UP:true", "LEFT:true", "LEFT:false", "UP:false"]);
});
