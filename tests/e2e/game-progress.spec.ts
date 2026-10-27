import { test, expect } from "@playwright/test";
import { build } from "vite";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
test("progress toggles, shows exact net rates and resets the local tracking baseline", async ({
  page,
}) => {
  await build({
    configFile: false,
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      outDir: ".cache/progress-harness",
      emptyOutDir: true,
      lib: {
        entry: "tests/harness/game-progress.tsx",
        name: "ProgressHarness",
        formats: ["iife"],
        fileName: () => "progress-harness.js",
      },
    },
  });
  let reset = 0;
  let unavailable = false;
  await page.route("http://progress.test/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/progress/reset")) {
      reset++;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    if (url.endsWith("/progress")) {
      if (unavailable) {
        await route.fulfill({
          status: 503,
          json: { error: "Game monitor unavailable" },
        });
        return;
      }
      await route.fulfill({
        json: {
          progress: {
            at: 3601000,
            slots: [
              {
                slot: 1,
                status: "ready",
                since: 1000,
                gold: "9007199254741001",
                goldStart: reset ? "9007199254741001" : "9007199254741101",
                petPower: "5000",
                petStart: reset ? "5000" : "4000",
                petSince: 1000,
              },
              { slot: 2, status: "waiting" },
              { slot: 3, status: "waiting" },
            ],
          },
        },
      });
      return;
    }
    await route.fulfill({
      contentType: "text/html",
      body: '<div id="root"></div>',
    });
  });
  await page.goto("http://progress.test/");
  await page.clock.install({ time: new Date(3601000) });
  await page.addScriptTag({
    path: resolve(".cache/progress-harness/progress-harness.js"),
  });
  await page.getByRole("button", { name: "Show stats", exact: true }).click();
  await expect(
    page.getByText("9,007,199,254,741,001", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("-100", { exact: true })).toHaveCount(2);
  await expect(page.getByText("1,000", { exact: true })).toHaveCount(2);
  await expect(
    page.getByText("Waiting for character data. Enter the game to begin.", {
      exact: true,
    }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Reset tracking baseline", exact: true })
    .click();
  expect(reset).toBe(0);
  await page
    .getByRole("button", { name: "Keep current session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reset tracking baseline", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm reset for all slots", exact: true })
    .click();
  expect(reset).toBe(1);
  await page.clock.runFor(5500);
  await expect(page.getByText("0", { exact: true })).toHaveCount(4);
  await page.getByRole("button", { name: "Hide stats", exact: true }).click();
  await expect(page.getByText("Gold balance", { exact: true })).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Show stats", exact: true }).click();
  await expect(page.getByText("Gold balance", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export snapshot CSV", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("farming-progress.csv");
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("sample_time,slot,status,gold_balance,net_gold_change");
  expect(csv).toContain("9007199254741001,0,0,5000,0,0");
  unavailable = true;
  await page.clock.runFor(20000);
  await expect(page.getByText("Data delayed", { exact: true })).toBeVisible();
  await expect(page.getByText("—", { exact: true })).toHaveCount(2);
});
