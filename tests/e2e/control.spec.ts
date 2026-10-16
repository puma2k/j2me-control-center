import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ControlPage } from "../pages/control.page.js";
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
let cleanupName = "";
test.afterEach(async ({ page }) => {
  if (!cleanupName) return;
  const name = cleanupName;
  cleanupName = "";
  const list = await page.request.get("/api/instances");
  if (!list.ok()) return;
  const i = (await list.json()).find((x: any) => x.name === name);
  if (i) {
    await page.request.post(`/api/instances/${i.id}/stop`, {
      headers: { "x-csrf-protection": "1" },
    });
    await page.request.delete(`/api/instances/${i.id}`, {
      headers: { "x-csrf-protection": "1" },
    });
  }
});
test("login → legal JAR upload → create → real frame → press/release → stop", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  const ui = new ControlPage(page);
  await ui.login(env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  await ui.library();
  await page
    .getByLabel("Upload game")
    .setInputFiles(resolve(".cache/control-test.jar"));
  await expect(
    page.getByRole("heading", { name: "Control Test", exact: true }).first(),
  ).toBeVisible();
  const name = `E2E ${Date.now()}`;
  cleanupName = name;
  await ui.create(name);
  await page
    .getByRole("button", { name: `Start ${name}`, exact: true })
    .click();
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name, exact: true }) });
  await expect(row.getByText("running", { exact: true })).toBeVisible({
    timeout: Number(process.env.RUNTIME_START_TIMEOUT_MS || 45000),
  });
  await page.getByRole("button", { name, exact: true }).click();
  const frame = page.getByRole("img", {
    name: `Screen ${name}`,
    exact: true,
  });
  await expect(frame).toBeVisible();
  await expect
    .poll(() => frame.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(240);
  await frame.click();
  await page.keyboard.type("Zqw");
  for (const code of [90, 113, 119])
    await expect(page.locator("pre")).toContainText(`TEST_KEY ${code} COUNT`);
  await page.keyboard.press("Backspace");
  await expect(page.locator("pre")).toContainText("TEST_KEY 8 COUNT");
  const before = await frame.getAttribute("src");
  await page.getByRole("button", { name: "Key OK", exact: true }).click();
  await expect.poll(() => frame.getAttribute("src")).not.toBe(before);
  await expect(page.locator("pre")).toContainText("TEST_KEY -5 COUNT");
  await expect(page.locator("pre")).toContainText("TEST_RELEASE -5");
  await frame.click({ position: { x: 60, y: 100 } });
  await expect(page.locator("pre")).toContainText(
    /TEST_POINTER_DOWN 60 (99|100)/,
  );
  await expect(page.locator("pre")).toContainText(
    /TEST_POINTER_UP 60 (99|100)/,
  );
  await page.getByText("Paste text (optional)", { exact: true }).click();
  // Password input intentionally has no implicit textbox role.
  const keyboard = page.getByLabel("Game text input", { exact: true });
  await keyboard.fill("qwAé");
  await keyboard.press("Enter");
  await expect(keyboard).toHaveValue("");
  for (const code of [113, 119, 65, 233])
    await expect(page.locator("pre")).toContainText(`TEST_KEY ${code} COUNT`);
  await page
    .getByRole("button", { name: "Delete one character in game", exact: true })
    .click();
  await expect(page.locator("pre")).toContainText("TEST_KEY 8 COUNT");
  for (const key of ["0", "#"]) {
    await page.getByRole("button", { name: `Key ${key}`, exact: true }).click();
    // Mobile viewport and browser input path: real phones open their native keyboard here.
    await page.setViewportSize({ width: 390, height: 844 });
    const sample = key === "0" ? "Xin chào 12" : "Form tiếng Việt 12";
    await frame.click();
    await page.keyboard.type(sample);

    await page.keyboard.press("Backspace");
    await page.keyboard.press("Enter");
    await expect(page.locator("pre")).toContainText(
      `TEST_NATIVE_TEXT ${Buffer.from(sample.slice(0, -1)).toString("base64")}`,
    );
    if (key === "#") {
      await expect(page.locator("pre")).toContainText(
        `TEST_NATIVE_EDIT ${sample.length}`,
      );
      await expect(page.locator("pre")).toContainText(
        `TEST_NATIVE_EDIT ${sample.length - 1}`,
      );
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await frame.click();
  await page.keyboard.down("ArrowUp");
  await expect(page.locator("pre")).toContainText("TEST_KEY -1 COUNT");
  // Keep held through at least one 3-second instance refresh.
  await page.waitForTimeout(3300);
  await expect(page.locator("pre")).not.toContainText("TEST_RELEASE -1");
  await page.keyboard.up("ArrowUp");
  await expect(page.locator("pre")).toContainText("TEST_RELEASE -1");
  await page.screenshot({
    path: ".cache/dashboard-detail.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "stop", exact: true }).click();
  await expect(
    page.getByText("stopped", { exact: true }).first(),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
  // Keep library, remove only the instance created by this test.
  const list = await page.request.get("/api/instances");
  const i = (await list.json()).find((x: any) => x.name === name);
  await page.request.delete(`/api/instances/${i.id}`, {
    headers: { "x-csrf-protection": "1" },
  });
});
test("mobile layout provides login and game library without overflowing viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const ui = new ControlPage(page);
  await ui.login(env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  await ui.library();
  await expect(
    page.getByRole("heading", { name: "Game library", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".cache/dashboard-mobile.png",
    fullPage: true,
  });
});
