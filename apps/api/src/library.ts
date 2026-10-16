import yauzl from "yauzl";
import { renameSync, existsSync } from "node:fs";
import { crc32 } from "node:zlib";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Store } from "./store.js";
import { AppError } from "./errors.js";
export function parseProperties(text: string): Map<string, string> {
  const out = new Map<string, string>();
  let previous = "";
  for (const line of text.replace(/\r/g, "").split("\n")) {
    if (line.startsWith(" ") && previous) {
      out.set(previous, out.get(previous) + line.slice(1));
      continue;
    }
    const colon = line.indexOf(":");
    if (colon > 0) {
      previous = line.slice(0, colon);
      out.set(previous, line.slice(colon + 1).trim());
    } else previous = "";
  }
  return out;
}
export function inspectJad(data: Buffer) {
  if (data.length > 65536 || data.includes(0))
    throw new AppError(400, "Invalid JAD descriptor");
  const props = parseProperties(data.toString("utf8"));
  const url = props.get("MIDlet-Jar-URL");
  if (!url || !/^[-\w .]+\.jar$/i.test(url) || url.includes(".."))
    throw new AppError(
      400,
      "JAD must refer to a local JAR filename, without paths or remote URLs",
    );
  return { name: props.get("MIDlet-Name") || url, url, props };
}
export async function inspectJar(data: Buffer) {
  if (data.length < 4 || data.readUInt32LE(0) !== 0x04034b50)
    throw new AppError(400, "Not a JAR/ZIP file");
  return new Promise<Record<string, string>>((resolve, reject) => {
    yauzl.fromBuffer(
      data,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (err, zip) => {
        if (err || !zip)
          return reject(new AppError(400, "Invalid ZIP archive"));
        let size = 0,
          count = 0,
          manifest: Record<string, string> | undefined;
        const names = new Set<string>();
        let done = false;
        const fail = (message: string) => {
          if (!done) {
            done = true;
            zip.close();
            reject(new AppError(400, message));
          }
        };
        zip.on("error", () => fail("Corrupt archive"));
        zip.on("entry", (e: yauzl.Entry) => {
          if (
            ++count > 4096 ||
            e.fileName.split("/").some((p) => p === "..") ||
            e.fileName.startsWith("/") ||
            e.fileName.includes("\\") ||
            names.has(e.fileName) ||
            e.generalPurposeBitFlag & 1 ||
            ((e.externalFileAttributes >>> 16) & 0xf000) === 0xa000
          )
            return fail("Unsafe ZIP entry");
          names.add(e.fileName);
          size += e.uncompressedSize;
          if (
            size > 128 * 1024 * 1024 ||
            e.uncompressedSize > 32 * 1024 * 1024 ||
            e.uncompressedSize > Math.max(1, e.compressedSize) * 250
          )
            return fail("Archive expansion limit exceeded");
          zip.openReadStream(e, (error, stream) => {
            if (error || !stream) return fail("Corrupt ZIP entry");
            let bytes = 0,
              checksum = 0;
            const chunks: Buffer[] = [];
            const isManifest =
              e.fileName.toUpperCase() === "META-INF/MANIFEST.MF";
            stream.on("error", () => fail("Corrupt ZIP data"));
            stream.on("data", (chunk: Buffer) => {
              bytes += chunk.length;
              checksum = crc32(chunk, checksum);
              if (bytes > e.uncompressedSize || (isManifest && bytes > 65536)) {
                stream.destroy();
                fail("Invalid entry size");
              } else if (isManifest) chunks.push(chunk);
            });
            stream.on("end", () => {
              if (done) return;
              if (checksum !== e.crc32) return fail("ZIP checksum mismatch");
              if (isManifest)
                manifest = Object.fromEntries(
                  parseProperties(Buffer.concat(chunks).toString("utf8")),
                );
              zip.readEntry();
            });
          });
        });
        zip.on("end", () => {
          if (done) return;
          done = true;
          if (!manifest?.["MIDlet-Name"] || !manifest["MIDlet-1"])
            return reject(
              new AppError(400, "Manifest lacks MIDlet-Name/MIDlet-1"),
            );
          const cls =
            manifest["MIDlet-1"].split(",").pop()?.trim().replace(/\./g, "/") +
            ".class";
          if (!names.has(cls))
            return reject(new AppError(400, "MIDlet entry class is missing"));
          resolve(manifest);
        });
        zip.readEntry();
      },
    );
  });
}
export class Library {
  constructor(
    public store: Store,
    public root: string,
  ) {}
  jarPath(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new AppError(400, "Invalid game ID");
    return join(this.root, `${id}.jar`);
  }
  async upload(filename: string, data: Buffer, gameId?: string) {
    if (data.length > 32 * 1024 * 1024)
      throw new AppError(413, "Maximum game size: 32 MiB");
    if (
      filename.includes("/") ||
      filename.includes("\\") ||
      filename.length > 180
    )
      throw new AppError(400, "Invalid filename");
    if (/\.jad$/i.test(filename)) {
      const jad = inspectJad(data);
      if (!gameId)
        throw new AppError(
          400,
          "Select the matching library JAR before uploading its JAD",
        );
      const g = this.store.game(gameId);
      if (!g) throw new AppError(404, "Game not found");
      if (
        jad.props.get("MIDlet-Name") &&
        jad.name !== g.manifest["MIDlet-Name"]
      )
        throw new AppError(400, "JAD name does not match JAR");
      const text = data
        .toString("utf8")
        .replace(/^MIDlet-Jar-URL:.*$/im, `MIDlet-Jar-URL: ${gameId}.jar`);
      await writeFile(join(this.root, `${gameId}.jad`), text, { mode: 0o600 });
      this.store.event("game.jad", { id: gameId });
      return g;
    }
    if (!/\.jar$/i.test(filename))
      throw new AppError(400, "Only .jar and .jad are supported");
    const manifest = await inspectJar(data);
    const id = createHash("sha256").update(data).digest("hex");
    const old = this.store.game(id);
    if (old) return old;
    const game = {
      id,
      name: manifest["MIDlet-Name"],
      version: manifest["MIDlet-Version"] || "",
      vendor: manifest["MIDlet-Vendor"] || "",
      filename,
      createdAt: Date.now(),
      manifest,
    };
    await mkdir(this.root, { recursive: true });
    await writeFile(this.jarPath(id), data, { mode: 0o600 });
    this.store.putGame(game);
    this.store.event("game.upload", { id, filename });
    return game;
  }
  async remove(id: string) {
    if (!this.store.game(id)) throw new AppError(404, "Game not found");
    if (this.store.instances().some((i) => i.gameId === id))
      throw new AppError(409, "Delete instances using this game first");
    this.store.db.prepare("DELETE FROM games WHERE id=?").run(id);
    // No await between removing metadata and moving files out of the content-addressed namespace.
    const removed: string[] = [];
    for (const path of [this.jarPath(id), join(this.root, `${id}.jad`)]) {
      if (existsSync(path)) {
        const trash = `${path}.deleted-${randomUUID()}`;
        renameSync(path, trash);
        removed.push(trash);
      }
    }
    this.store.event("game.delete", { id });
    await Promise.all(removed.map((path) => unlink(path).catch(() => {})));
  }
}
