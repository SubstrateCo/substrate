import { authorizationCallback, requestBrowserSignIn } from "../test-support/auth.js";
import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

test("desktop session transfer recovers from replay, restart, and offline navigation", async ({
  desktop,
}) => {
  await desktop.provision();
  const { page, browser, workspace } = desktop;
  await desktop.signout();
  expect(
    await page.evaluate(async () => (await (await fetch("/api/v1/session")).json()).data),
  ).toBeNull();
  await requestBrowserSignIn(desktop.app, page, browser);
  await expect(browser.getByText("Return to Startup OS", { exact: true })).toBeVisible();
  const callback = await authorizationCallback(browser, () =>
    browser.getByRole("button", { name: "Continue to Startup OS", exact: true }).click(),
  );
  await desktop.openLink(callback);
  await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
  await desktop.signout();
  await desktop.openLink(callback);
  await expect(
    page.getByText("Could not complete sign-in. Please try again.", { exact: true }),
  ).toBeVisible();
  await requestBrowserSignIn(desktop.app, page, browser);
  const retry = await authorizationCallback(browser, () =>
    browser.getByRole("button", { name: "Continue to Startup OS", exact: true }).click(),
  );
  await desktop.openLink(retry);
  await expect(page.getByRole("button", { name: `${workspace} ▾`, exact: true })).toBeVisible();
  const id = await page.evaluate(
    async () => (await (await fetch("/api/v1/session")).json()).data.session.id,
  );
  await desktop.restart();
  const restarted = desktop.page;
  await expect(
    restarted.getByRole("button", { name: `${workspace} ▾`, exact: true }),
  ).toBeVisible();
  expect(
    await restarted.evaluate(
      async () => (await (await fetch("/api/v1/session")).json()).data.session.id,
    ),
  ).toBe(id);
  await desktop.app.evaluate(
    async ({ BrowserWindow }, path) => {
      await BrowserWindow.getAllWindows()[0]!.loadFile(path);
    },
    fileURLToPath(new URL("../../src/shell/offline.html", import.meta.url)),
  );
  await expect(
    restarted.getByRole("heading", { name: "Cannot connect to Startup OS", exact: true }),
  ).toBeVisible();
  await restarted.getByRole("link", { name: "Try again", exact: true }).click();
  await expect(
    restarted.getByRole("button", { name: `${workspace} ▾`, exact: true }),
  ).toBeVisible();
  expect(desktop.app.windows()).toHaveLength(1);
  expect(await restarted.evaluate("typeof require")).toBe("undefined");
});
