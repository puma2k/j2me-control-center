import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { z, ZodError } from "zod";
import { join, resolve } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import { exportSaves, importSaves } from "./saves.js";
import { Store } from "./store.js";
import { Library } from "./library.js";
import { Manager } from "./manager.js";
import { Auth } from "./auth.js";
import { AppError } from "./errors.js";
import { registerStream } from "./stream.js";
import { FreeJ2ME } from "../../../runtime/freej2me.js";
import type { AdapterFactory } from "../../../runtime/adapter.js";
import {
  instanceInput,
  patchInput,
  idInput,
  settingsInput,
  type Settings,
} from "../../../packages/shared/schema.js";
export type AppOptions = {
  dataDir: string;
  username: string;
  password: string;
  emulatorDir: string;
  logger?: boolean;
  secure?: boolean;
  origin?: string;
  sessionTtl?: number;
  defaults?: Settings;
  factory?: AdapterFactory;
  webDir?: string;
};
export async function buildApp(options: AppOptions) {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 1024 * 1024,
    requestTimeout: 60000,
  });
  const root = resolve(options.dataDir),
    games = join(root, "games"),
    state = join(root, "state");
  await mkdir(games, { recursive: true });
  await mkdir(state, { recursive: true });
  const store = new Store(join(root, "control.sqlite"));
  const library = new Library(store, games);
  const defaults = options.defaults || {
    maxInstances: 5,
    memoryBudgetMb: 2048,
    streamFps: 60,
    quality: 75,
  };
  const persisted = store.settings(defaults);
  const bounded = {
    ...persisted,
    maxInstances: Math.min(persisted.maxInstances, defaults.maxInstances),
    memoryBudgetMb: Math.min(persisted.memoryBudgetMb, defaults.memoryBudgetMb),
  };
  let display = 100;
  const manager = new Manager(
    store,
    options.factory ||
      ((i) => new FreeJ2ME(i, state, games, options.emulatorDir, display++)),
    bounded,
  );
  const auth = new Auth(
    store,
    options.username,
    options.password,
    options.sessionTtl || 28800,
    options.secure || false,
    options.origin,
  );
  await app.register(cookie);
  await app.register(rateLimit, { max: 600, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: { fileSize: 32 * 1024 * 1024, files: 1, fields: 5, parts: 6 },
  });
  await app.register(websocket, { options: { maxPayload: 16384 } });
  await app.register(swagger, {
    openapi: { info: { title: "J2ME Control Center", version: "1.0.0" } },
  });
  app.setErrorHandler((e, req, reply) => {
    const error = e as Error & { statusCode?: number };
    const status = e instanceof ZodError ? 400 : error.statusCode || 500;
    if (status >= 500) req.log.error(e);
    reply.code(status).send({
      error: status >= 500 ? "Internal server error" : error.message,
      requestId: req.id,
      ...(e instanceof ZodError ? { issues: e.issues } : {}),
    });
  });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "same-origin")
      .header("X-Frame-Options", "DENY");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: blob:; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'",
    );
    if (req.url.startsWith("/api/") || req.url.startsWith("/docs")) {
      reply.header("Cache-Control", "no-store");
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) auth.csrf(req);
      if (!["/api/health", "/api/auth/login"].includes(req.url.split("?")[0]))
        auth.require(req);
    }
  });
  app.get("/api/health", async () => ({ ok: true, version: "1.0.0" }));
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const b = z
        .object({
          username: z.string().min(1).max(80),
          password: z.string().max(256),
        })
        .parse(req.body);
      return auth.login(b.username, b.password, reply);
    },
  );
  app.post("/api/auth/logout", async (req, reply) => auth.logout(req, reply));
  app.get("/api/auth/me", async (req) => auth.require(req));
  app.get("/api/games", async (req) => {
    const { q } = z
      .object({ q: z.string().max(100).optional() })
      .parse(req.query);
    return store
      .games()
      .filter((g) => !q || g.name.toLowerCase().includes(q.toLowerCase()));
  });
  app.get("/api/games/:id", async (req) => {
    const { id } = z.object({ id: idInput }).parse(req.params);
    const g = store.game(id);
    if (!g) throw new AppError(404, "Game not found");
    return g;
  });
  const upload = async (req: any) => {
    const file = await req.file();
    if (!file) throw new AppError(400, "Choose a JAR/JAD file");
    const data = await file.toBuffer();
    if (file.file.truncated) throw new AppError(413, "File too large");
    const { gameId } = z
      .object({ gameId: z.string().optional() })
      .parse(req.query);
    return library.upload(file.filename, data, gameId);
  };
  app.post("/api/games/upload", upload);
  app.post("/api/games", upload);
  app.patch("/api/games/:id", async (req) => {
    const { id } = z.object({ id: idInput }).parse(req.params);
    const { name } = z
      .object({ name: z.string().trim().min(1).max(80) })
      .parse(req.body);
    const g = store.game(id);
    if (!g) throw new AppError(404, "Game not found");
    store.putGame({ ...g, name });
    return store.game(id);
  });
  app.delete("/api/games/:id", async (req) => {
    const { id } = z.object({ id: idInput }).parse(req.params);
    await library.remove(id);
    return { ok: true };
  });
  app.get("/api/instances", async () => store.instances());
  app.post("/api/instances", async (req) =>
    manager.create(instanceInput.parse(req.body)),
  );
  app.get("/api/instances/:id", async (req) =>
    manager.get(z.object({ id: idInput }).parse(req.params).id),
  );
  app.patch("/api/instances/:id", async (req) =>
    manager.patch(
      z.object({ id: idInput }).parse(req.params).id,
      patchInput.parse(req.body),
    ),
  );
  app.delete("/api/instances/:id", async (req) => {
    const id = z.object({ id: idInput }).parse(req.params).id;
    const result = await manager.remove(id);
    await rm(join(state, id), { recursive: true, force: true });
    return result;
  });
  for (const action of ["start", "stop", "restart"] as const)
    app.post(`/api/instances/:id/${action}`, async (req) =>
      manager[action](z.object({ id: idInput }).parse(req.params).id),
    );
  app.post("/api/instances/bulk", async (req) => {
    const b = z
      .object({
        action: z.enum(["start", "stop", "restart"]),
        ids: z.array(idInput).min(1).max(100),
      })
      .parse(req.body);
    const results = [];
    for (const id of [...new Set(b.ids)]) {
      try {
        results.push({ id, ok: true, instance: await manager[b.action](id) });
      } catch (e) {
        results.push({ id, ok: false, error: String(e) });
      }
    }
    return results;
  });
  app.get("/api/instances/:id/logs", async (req) => {
    const id = z.object({ id: idInput }).parse(req.params).id;
    const i = manager.get(id);
    return {
      text: await (
        manager.adapters.get(id) ||
        new FreeJ2ME(i, state, games, options.emulatorDir, 0)
      ).getLogs(),
    };
  });
  app.get("/api/instances/:id/metrics", async (req) => {
    const id = z.object({ id: idInput }).parse(req.params).id;
    manager.get(id);
    return (
      (await manager.adapters.get(id)?.getMetrics()) || {
        pid: null,
        cpuPercent: 0,
        rssMb: 0,
        uptimeSeconds: 0,
      }
    );
  });
  app.get("/api/instances/:id/screenshot", async (req, reply) => {
    const id = z.object({ id: idInput }).parse(req.params).id;
    manager.get(id);
    const a = manager.adapters.get(id);
    if (!a) throw new AppError(409, "Instance not running");
    return reply
      .type("image/png")
      .header("Content-Disposition", `attachment; filename="${id}.png"`)
      .send(await a.captureFrame());
  });
  const stream = registerStream(app, manager, auth);
  app.get("/api/metrics/summary", async () => ({
    total: store.instances().length,
    running: store.instances().filter((i) => i.status === "running").length,
    failed: store.instances().filter((i) => i.status === "failed").length,
    host: {
      cpus: os.cpus().length,
      load: os.loadavg(),
      totalMemoryMb: os.totalmem() / 1048576,
      freeMemoryMb: os.freemem() / 1048576,
    },
    instances: await Promise.all(
      store.instances().map(async (i) => ({
        id: i.id,
        ...(await manager.adapters.get(i.id)?.getMetrics()),
        stream: stream.stats.get(i.id),
      })),
    ),
    viewers: stream.clients.size,
  }));
  app.get("/api/settings", async () => ({
    ...manager.settings,
    diagnostics: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      emulatorPresent: existsSync(
        join(options.emulatorDir, "build/freej2me_plus.jar"),
      ),
      dataDir: root,
    },
  }));
  app.post("/api/settings", async (req) => {
    const s = settingsInput.parse(req.body);
    if (
      s.maxInstances > defaults.maxInstances ||
      s.memoryBudgetMb > defaults.memoryBudgetMb
    )
      throw new AppError(400, "Limits cannot exceed environment hard caps");
    manager.settings = s;
    store.putSettings(s);
    store.event("settings.update", s);
    return s;
  });
  app.get("/api/instances/:id/saves", async (req, reply) => {
    const id = z.object({ id: idInput }).parse(req.params).id;
    const data = await manager.withStopped(id, () =>
      exportSaves(join(state, id)),
    );
    return reply
      .header("Content-Disposition", `attachment; filename="${id}-saves.json"`)
      .send(data);
  });
  app.post(
    "/api/instances/:id/saves",
    { bodyLimit: 48 * 1024 * 1024 },
    async (req) => {
      const id = z.object({ id: idInput }).parse(req.params).id;
      const result = await manager.withStopped(id, () =>
        importSaves(join(state, id), req.body),
      );
      store.event("instance.import-saves", { id });
      return result;
    },
  );
  app.get("/api/events", async () =>
    store.db.prepare("SELECT * FROM events ORDER BY id DESC LIMIT 100").all(),
  );
  await app.register(swaggerUi, { routePrefix: "/docs" });
  const webDir = options.webDir || resolve("apps/web/dist");
  if (existsSync(webDir)) {
    await app.register(fastifyStatic, {
      root: webDir,
      index: "index.html",
      list: false,
    });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api") || req.url.startsWith("/ws")
        ? reply.code(404).send({ error: "Not found" })
        : reply.sendFile("index.html"),
    );
  }
  app.addHook("onClose", async () => {
    await manager.shutdown();
    store.close();
  });
  await manager.reconcile();
  return app;
}
