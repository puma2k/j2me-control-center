import { buildApp } from "./app.js";
const app = await buildApp({
  dataDir: process.env.DATA_DIR || "data",
  username: process.env.ADMIN_USERNAME || "admin",
  password: process.env.ADMIN_PASSWORD || "",
  emulatorDir: process.env.EMULATOR_DIR || "/emulator",
  secure: process.env.COOKIE_SECURE === "true",
  origin: process.env.PUBLIC_ORIGIN || undefined,
  sessionTtl: Number(process.env.SESSION_TTL_SECONDS || 28800),
  defaults: {
    maxInstances: Number(process.env.MAX_INSTANCES || 5),
    memoryBudgetMb: Number(process.env.MEMORY_BUDGET_MB || 2048),
    streamFps: Number(process.env.STREAM_FPS || 60),
    quality: Number(process.env.STREAM_QUALITY || 75),
  },
});
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
await app.listen({
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3000),
});
