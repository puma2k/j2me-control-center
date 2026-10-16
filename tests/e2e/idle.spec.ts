import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ControlPage } from "../pages/control.page.js";
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
test("idle screen unsubscribes, game keeps running, and first key only wakes", async ({
  page,
}) => {
  const ui = new ControlPage(page);
  await ui.login(env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  const headers = { "x-csrf-protection": "1" };
  const upload = await page.request.post("/api/games/upload", {
    headers,
    multipart: {
      file: {
        name: "control-test.jar",
        mimeType: "application/java-archive",
        buffer: readFileSync(".cache/control-test.jar"),
      },
    },
  });
  expect(upload.ok()).toBe(true);
  const game = await upload.json();
  const create = await page.request.post("/api/instances", {
    headers,
    data: { name: `Idle ${Date.now()}`, gameId: game.id },
  });
  expect(create.ok()).toBe(true);
  const instance = await create.json();
  const sent: any[] = [];
  let frames = 0;
  page.on("websocket", (ws) => {
    ws.on("framesent", (event) => {
      try {
        sent.push(JSON.parse(String(event.payload)));
      } catch {}
    });
    ws.on("framereceived", (event) => {
      try {
        if (JSON.parse(String(event.payload)).type === "frame") frames++;
      } catch {}
    });
  });
  try {
    expect(
      (
        await page.request.post(`/api/instances/${instance.id}/start`, {
          headers,
        })
      ).ok(),
    ).toBe(true);
    await page.clock.install();
    await page.reload();
    await page
      .getByRole("button", { name: instance.name, exact: true })
      .click();
    const frame = page.getByRole("img", {
      name: `Màn hình ${instance.name}`,
      exact: true,
    });
    await expect(frame).toBeVisible();
    await frame.click();
    const before = await (
      await page.request.get(`/api/instances/${instance.id}/metrics`)
    ).json();
    await page.clock.fastForward(31000);
    await expect(
      page.getByRole("button", { name: "Đánh thức màn hình" }),
    ).toBeVisible();
    await expect
      .poll(() => sent.filter((m) => m.type === "subscribe").at(-1)?.ids)
      .toEqual([]);
    const after = await (
      await page.request.get(`/api/instances/${instance.id}/metrics`)
    ).json();
    expect(after.pid).toBe(before.pid);
    const config = await (
      await page.request.get(`/api/instances/${instance.id}`)
    ).json();
    expect(config.status).toBe("running");
    expect(config.fps).toBe(60);
    // One capture may already be in flight when unsubscribe arrives.
    const pausedFrames = frames;
    await page.clock.runFor(1000);
    expect(frames).toBeLessThanOrEqual(pausedFrames + 1);
    const keysBefore = sent.filter(
      (m) => m.type === "key" || m.type === "text",
    ).length;
    await page.keyboard.press("Enter");
    await expect(frame).toBeVisible();
    expect(
      sent.filter((m) => m.type === "key" || m.type === "text").length,
    ).toBe(keysBefore);
    await expect.poll(() => frames).toBeGreaterThan(pausedFrames);
    await page.keyboard.type("Z");
    await expect(page.locator("pre")).toContainText("TEST_KEY 90 COUNT");
    await page.clock.fastForward(31000);
    const sleeping = page.getByRole("button", { name: "Đánh thức màn hình" });
    await expect(sleeping).toBeVisible();
    const gameInputs = () =>
      sent.filter((m) => ["pointer", "key", "text"].includes(m.type)).length;
    const inputsBeforeClick = gameInputs();
    await sleeping.hover();
    await expect(sleeping).toHaveCSS("background-color", "rgb(0, 0, 0)");
    await sleeping.click();
    await expect(frame).toBeVisible();
    expect(gameInputs()).toBe(inputsBeforeClick);
  } finally {
    await page.request.post(`/api/instances/${instance.id}/stop`, { headers });
    await page.request.delete(`/api/instances/${instance.id}`, { headers });
  }
});
