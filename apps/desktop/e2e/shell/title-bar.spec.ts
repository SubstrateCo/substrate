import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

test("native title bar stays clear of sign-in, workspace and offline content", async ({
  desktop,
}) => {
  const page = desktop.page;
  const bar = page.getByRole("banner", { name: "Window title bar" });
  await expect(bar).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("title-bar-sign-in.png") });
  expect(
    await desktop.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.isMenuBarVisible(),
    ),
  ).toBe(false);
  await expect(
    page.getByRole("button", { name: "Sign in with browser", exact: true }),
  ).toBeVisible();
  expect(
    await bar.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("-webkit-app-region"),
    ),
  ).toBe("drag");
  const barBottom = (await bar.boundingBox())!.height;
  expect((await page.getByRole("main").boundingBox())!.y).toBeGreaterThanOrEqual(barBottom);
  await page.getByRole("button", { name: "Color theme", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect
    .poll(() => desktop.app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors))
    .toBe(true);
  await page.getByRole("button", { name: "Color theme", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Light", exact: true }).click();
  await expect
    .poll(() => desktop.app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors))
    .toBe(false);
  await desktop.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setFullScreen(true),
  );
  await expect(page.locator(".desktop-frame")).toHaveAttribute("data-fullscreen", "true");
  await desktop.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setFullScreen(false),
  );
  await expect(page.locator(".desktop-frame")).toHaveAttribute("data-fullscreen", "false");

  await desktop.provision();
  await expect(bar).toBeVisible();
  const workspace = page.locator("[data-workspace-shell]");
  expect((await workspace.boundingBox())!.y).toBeGreaterThanOrEqual(barBottom);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(
    await page.evaluate(() => innerHeight),
  );
  await page.screenshot({ path: test.info().outputPath("title-bar-workspace.png") });
  await desktop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.maximize());
  await expect
    .poll(() =>
      desktop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMaximized()),
    )
    .toBe(true);
  await expect(bar).toBeVisible();
  await desktop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.unmaximize());
  await expect
    .poll(() =>
      desktop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMaximized()),
    )
    .toBe(false);

  await desktop.app.evaluate(
    async ({ BrowserWindow }, path) => {
      await BrowserWindow.getAllWindows()[0]!.loadFile(path);
    },
    fileURLToPath(new URL("../../src/shell/offline.html", import.meta.url)),
  );
  await expect(bar).toBeVisible();
  const retry = page.getByRole("link", { name: "Try again", exact: true });
  expect(
    await retry.evaluate((element) =>
      getComputedStyle(element).getPropertyValue("-webkit-app-region"),
    ),
  ).not.toBe("drag");
  await retry.click();
  await expect(bar).toBeVisible();
  await expect(workspace).toBeVisible();
});

test("title bar and auth content fit narrow windows at app zoom", async ({ desktop }) => {
  const page = desktop.page;
  await desktop.app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    window.setMinimumSize(320, 200);
    window.setContentSize(320, 568);
    window.webContents.setZoomFactor(1.25);
  });
  const bar = page.getByRole("banner", { name: "Window title bar" });
  await expect(bar).toBeVisible();
  const signIn = page.getByRole("button", { name: "Sign in with browser", exact: true });
  await expect(signIn).toBeVisible();
  const content = await signIn.boundingBox();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(content!.y).toBeGreaterThanOrEqual((await bar.boundingBox())!.height);
  expect(content!.x + content!.width).toBeLessThanOrEqual(viewport.width);
  expect(content!.y + content!.height).toBeLessThanOrEqual(viewport.height);
  await page.screenshot({ path: test.info().outputPath("title-bar-narrow-zoom.png") });
});
