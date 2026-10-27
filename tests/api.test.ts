import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildApp } from "../apps/api/src/app.js";
test("private API requires auth, secure cookie, CSRF protection and persists sessions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "j2me-api-"));
  const app = await buildApp({
    dataDir: dir,
    username: "admin",
    password: "test-password-long",
    emulatorDir: "/missing",
    logger: false,
  });
  try {
    assert.equal((await app.inject("/api/instances")).statusCode, 401);
    assert.equal(
      (await app.inject("/api/instances/test/text-editor")).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/instances/test/text-editor",
          headers: { "x-csrf-protection": "1" },
          payload: { token: "abc", text: "fixture" },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (await app.inject("/api/instances/test/progress")).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/instances/test/progress/reset",
          headers: { "x-csrf-protection": "1" },
        })
      ).statusCode,
      401,
    );
    assert.equal((await app.inject("/api/health")).statusCode, 200);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { origin: "https://evil.example" },
          payload: { username: "admin", password: "test-password-long" },
        })
      ).statusCode,
      403,
    );
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "x-csrf-protection": "1" },
      payload: { username: "admin", password: "test-password-long" },
    });
    assert.equal(login.statusCode, 200);
    assert.match(String(login.headers["set-cookie"]), /HttpOnly/);
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    assert.equal(
      (await app.inject({ url: "/api/instances", headers: { cookie } }))
        .statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/instances",
          headers: { cookie },
          payload: {},
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/instances",
          headers: { cookie, "x-csrf-protection": "1" },
          payload: { gameId: "../../etc/passwd", name: "x" },
        })
      ).statusCode,
      400,
    );
    const bad = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "x-csrf-protection": "1" },
      payload: { username: "admin", password: "bad" },
    });
    assert.equal(bad.statusCode, 401);
    await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie, "x-csrf-protection": "1" },
    });
    assert.equal(
      (await app.inject({ url: "/api/instances", headers: { cookie } }))
        .statusCode,
      401,
    );
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("environment hard caps override saved settings after restart; password rotation revokes sessions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "j2me-caps-"));
  const options = {
    dataDir: dir,
    username: "admin",
    password: "test-password-long",
    emulatorDir: "/missing",
    logger: false,
  };
  let app = await buildApp(options);
  try {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "x-csrf-protection": "1" },
      payload: { username: "admin", password: options.password },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    await app.inject({
      method: "POST",
      url: "/api/settings",
      headers: { cookie, "x-csrf-protection": "1" },
      payload: {
        maxInstances: 5,
        memoryBudgetMb: 2048,
        streamFps: 10,
        quality: 75,
      },
    });
    await app.close();
    app = await buildApp({
      ...options,
      password: "rotated-password-long",
      defaults: {
        maxInstances: 1,
        memoryBudgetMb: 512,
        streamFps: 10,
        quality: 75,
      },
    });
    assert.equal(
      (await app.inject({ url: "/api/instances", headers: { cookie } }))
        .statusCode,
      401,
    );
    const next = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "x-csrf-protection": "1" },
      payload: { username: "admin", password: "rotated-password-long" },
    });
    assert.equal(next.statusCode, 200);
    const settings = await app.inject({
      url: "/api/settings",
      headers: { cookie: String(next.headers["set-cookie"]).split(";")[0] },
    });
    assert.equal(settings.json().maxInstances, 1);
    assert.equal(settings.json().memoryBudgetMb, 512);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
