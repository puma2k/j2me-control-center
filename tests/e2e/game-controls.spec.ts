import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { build } from "vite";
test("NRMod keyboard preserves typing, releases keys and sends the wrapper menu hold", async ({
  page,
}) => {
  await build({
    configFile: false,
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      outDir: ".cache/control-harness",
      emptyOutDir: true,
      lib: {
        entry: "tests/harness/game-controls.tsx",
        name: "ControlsHarness",
        formats: ["iife"],
        fileName: () => "profile-harness.js",
      },
    },
  });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({
    path: resolve(".cache/control-harness/profile-harness.js"),
  });
  const events = page.getByLabel("Events");
  const input = page.getByRole("textbox", {
    name: "Direct typing",
    exact: true,
  });
  await input.fill("chat QW");
  await expect(events).toHaveText("");
  await input.press("Alt+5");
  await expect(events).toHaveText("5:down,5:up");
  await input.press("Alt+q");
  await expect(events).toHaveText("5:down,5:up,SOFT_LEFT:down,SOFT_LEFT:up");
  const previous = await events.textContent();
  await page
    .getByRole("textbox", { name: "Settings field", exact: true })
    .press("Alt+5");
  await expect(events).toHaveText(previous!);
  await input.focus();
  await page.keyboard.down("Alt");
  await page.keyboard.down("ArrowRight");
  await expect(events).toContainText("RIGHT:down");
  await page
    .getByRole("button", { name: "Toggle runtime", exact: true })
    .click();
  await expect(events).toContainText("RIGHT:down,RIGHT:up");
  await page.keyboard.up("ArrowRight");
  await page.keyboard.up("Alt");
  await expect(
    page.getByRole("button", {
      name: "Switch game slot",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Toggle runtime", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(events).toContainText("OK:down,OK:up");
  await page.clock.install();
  await page
    .getByRole("button", {
      name: "Switch game slot",
      exact: true,
    })
    .click();
  await expect(events).toContainText("*:down");
  await page.clock.runFor(700);
  await expect(events).toContainText("*:down,*:up");
  await page.getByRole("button", { name: "Toggle sleep", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Switch game slot",
      exact: true,
    }),
  ).toBeDisabled();
});
