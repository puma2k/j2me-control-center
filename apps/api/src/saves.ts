import {
  readdir,
  readFile,
  mkdir,
  writeFile,
  rename,
  rm,
  lstat,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "./errors.js";
const maxBytes = 32 * 1024 * 1024;
const archiveSchema = z
  .object({
    version: z.literal(1),
    files: z
      .array(
        z
          .object({
            path: z.string().min(5).max(240),
            data: z.string().max(44 * 1024 * 1024),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict();
export type SaveArchive = z.infer<typeof archiveSchema>;
export async function exportSaves(cwd: string): Promise<SaveArchive> {
  const files: SaveArchive["files"] = [];
  let bytes = 0;
  async function walk(dir: string, prefix: string, depth = 0): Promise<void> {
    if (depth > 12) throw new AppError(400, "Save nesting too deep");
    const info = await lstat(dir).catch(() => null);
    if (!info || info.isSymbolicLink() || !info.isDirectory()) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = `${prefix}/${entry.name}`,
        path = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(path, relative, depth + 1);
      else if (entry.isFile()) {
        if (files.length >= 1000)
          throw new AppError(413, "Too many save files");
        const st = await lstat(path);
        bytes += st.size;
        if (bytes > maxBytes) throw new AppError(413, "Save exceeds 32 MiB");
        files.push({
          path: relative,
          data: (await readFile(path)).toString("base64"),
        });
      }
    }
  }
  for (const root of ["rms", "config"]) await walk(join(cwd, root), root);
  return { version: 1, files };
}
export async function importSaves(cwd: string, input: unknown) {
  const archive = archiveSchema.parse(input),
    seen = new Set<string>();
  let total = 0;
  const decoded = archive.files.map((f) => {
    if (
      !/^(rms|config)\//.test(f.path) ||
      /[\\\u0000-\u001f]/.test(f.path) ||
      f.path.split("/").some((p) => !p || p === "." || p === "..") ||
      seen.has(f.path) ||
      f.data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(f.data)
    )
      throw new AppError(400, "Unsafe save archive");
    seen.add(f.path);
    const data = Buffer.from(f.data, "base64");
    if (data.toString("base64") !== f.data)
      throw new AppError(400, "Non-canonical base64 save");
    total += data.length;
    if (total > maxBytes) throw new AppError(413, "Save exceeds 32 MiB");
    return { ...f, data };
  });
  await mkdir(cwd, { recursive: true });
  const stage = join(cwd, `.import-${randomUUID()}`);
  await mkdir(stage);
  const swapped: string[] = [];
  const old: string[] = [];
  try {
    for (const root of ["rms", "config"]) await mkdir(join(stage, root));
    for (const f of decoded) {
      const dest = join(stage, f.path);
      await mkdir(dest.slice(0, dest.lastIndexOf("/")), { recursive: true });
      await writeFile(dest, f.data, { mode: 0o600, flag: "wx" });
    }
    for (const root of ["rms", "config"]) {
      if (await lstat(join(cwd, root)).catch(() => null)) {
        await rename(join(cwd, root), join(stage, `${root}.old`));
        old.push(root);
      }
      await rename(join(stage, root), join(cwd, root));
      swapped.push(root);
    }
  } catch (e) {
    for (const root of swapped)
      await rm(join(cwd, root), { recursive: true, force: true });
    for (const root of old)
      await rename(join(stage, `${root}.old`), join(cwd, root)).catch(() => {});
    throw e;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  return { ok: true, files: decoded.length, bytes: total };
}
