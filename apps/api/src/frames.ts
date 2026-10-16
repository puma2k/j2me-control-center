import sharp from "sharp";
import type { EmulatorAdapter } from "../../../runtime/adapter.js";
/** Share one short-lived encoded frame across viewers without retaining stopped runtimes. */
export class FrameEncoder {
  private cache = new WeakMap<
    EmulatorAdapter,
    Map<number, { at: number; promise: Promise<Buffer> }>
  >();
  constructor(private now = Date.now) {}
  encode(adapter: EmulatorAdapter, quality: number) {
    let entries = this.cache.get(adapter);
    if (!entries) {
      entries = new Map();
      this.cache.set(adapter, entries);
    }
    const cached = entries.get(quality),
      at = this.now();
    if (cached && at - cached.at < 8) return cached.promise;
    const promise = (async () => {
      if (adapter.captureRaw) {
        const raw = await adapter.captureRaw();
        return sharp(raw.data, {
          raw: { width: raw.width, height: raw.height, channels: 3 },
        })
          .jpeg({ quality })
          .toBuffer();
      }
      return sharp(await adapter.captureFrame())
        .jpeg({ quality })
        .toBuffer();
    })();
    const entry = { at, promise };
    entries.set(quality, entry);
    if (entries.size > 4) entries.delete(entries.keys().next().value!);
    void promise.catch(() => {
      if (entries!.get(quality) === entry) entries!.delete(quality);
    });
    return promise;
  }
}
