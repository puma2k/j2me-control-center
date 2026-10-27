import { test } from "node:test";
import assert from "node:assert/strict";
import { progressDelta, hourlyRate } from "../apps/web/src/progress.js";
test("progress uses exact 64-bit differences and signed net hourly rates", () => {
  assert.equal(progressDelta("9007199254741001", "9007199254740993"), 8n);
  assert.equal(hourlyRate(progressDelta("100", "130"), 1000, 3601000), -30n);
  assert.equal(hourlyRate(100n, 0, 1800000), 200n);
  assert.equal(hourlyRate(100n, 0, 999), null);
  assert.equal(progressDelta(null, "10"), null);
  assert.equal(progressDelta("bad", "10"), null);
});
