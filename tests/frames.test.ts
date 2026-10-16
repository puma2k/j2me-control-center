import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { FrameEncoder } from "../apps/api/src/frames.js";
import type { EmulatorAdapter } from "../runtime/adapter.js";
test("raw stream frames avoid PNG and share encoding across viewers within one frame", async () => {
  let calls = 0,
    now = 100;
  const a = {
    captureRaw: async () => {
      calls++;
      return { data: Buffer.alloc(12, 100), width: 2, height: 2 };
    },
    captureFrame: async () => {
      throw new Error("PNG path should not run");
    },
  } as unknown as EmulatorAdapter;
  const encoder = new FrameEncoder(() => now);
  const [first, second] = await Promise.all([
    encoder.encode(a, 60),
    encoder.encode(a, 60),
  ]);
  assert.equal(first, second);
  assert.equal(calls, 1);
  assert.equal((await sharp(first).metadata()).format, "jpeg");
  now += 17;
  await encoder.encode(a, 60);
  assert.equal(calls, 2);
  await encoder.encode(a, 75);
  assert.equal(calls, 3);
});
