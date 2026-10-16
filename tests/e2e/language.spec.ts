import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ControlPage } from "../pages/control.page.js";
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
test("English interface covers login, navigation, creation and configuration", async ({
  page,
}) => {
  const ui = new ControlPage(page);
  await ui.login(env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "⚙ Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "System settings", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save settings", exact: true }),
  ).toBeVisible();
  await ui.library();
  await page.getByLabel("Upload game").setInputFiles(".cache/control-test.jar");
  await expect(
    page.getByRole("heading", { name: "Control Test", exact: true }).first(),
  ).toBeVisible();
  const name = `English UI ${Date.now()}`;
  const headers = { "x-csrf-protection": "1" };
  let instanceId: string | undefined;
  try {
    await ui.create(name);
    const list = await (await page.request.get("/api/instances")).json();
    instanceId = list.find((i: any) => i.name === name).id;
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Instance configuration",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Instance is not running", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Game FPS", { exact: true })).toHaveValue(
      "60",
    );
    await expect(page.getByLabel("After server restart")).toBeVisible();
    await page.getByLabel("Name", { exact: true }).fill(`${name} renamed`);
    await page
      .getByRole("button", { name: "Save configuration", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: `${name} renamed`, exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "← Back", exact: true }).click();
    await ui.library();
    await expect(
      page.getByRole("heading", { name: "Game library", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
  } finally {
    if (instanceId)
      await page.request.delete(`/api/instances/${instanceId}`, { headers });
  }
});
