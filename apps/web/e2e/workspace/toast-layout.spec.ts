import type { DesktopUpdatesAPI } from "@substrate/contracts/desktop/updates-ipc";
import type { DesktopWindowAPI } from "@substrate/contracts/desktop/window";

import { visit } from "../test-support/fixtures";
import { test } from "../test-support/workspace-fixtures";
import { expect } from "@playwright/test";

test.use({ reducedMotion: "no-preference" });

test("dismissing a toast does not resize or scroll the app frame", async ({ account, client }) => {
  const user = await client(account);
  const { page } = user;
  await page.addInitScript(() => {
    const windowBridge: DesktopWindowAPI = {
      platform: "win32",
      production: false,
      isFullscreen: async () => false,
      setTheme: async () => {},
      openGoogleLink: async () => {},
      onFullscreenChange: () => () => {},
    };
    const updatesBridge: DesktopUpdatesAPI = {
      get: async () => ({
        appVersion: "1.0.0",
        install: "automatic",
        state: { status: "ready", version: "1.0.1" },
      }),
      checkForUpdates: async () => ({
        appVersion: "1.0.0",
        install: "automatic",
        state: { status: "ready", version: "1.0.1" },
      }),
      installNow: async () => {},
      openDownloadPage: async () => {},
      onChange: () => () => {},
    };
    Object.defineProperty(window, "substrateWindow", { value: windowBridge });
    Object.defineProperty(window, "substrateUpdates", { value: updatesBridge });
  });
  await visit(user);
  const toast = page.locator("[data-sonner-toast]");
  await expect(toast).toContainText("1.0.1");
  await expect(toast).toHaveAttribute("data-mounted", "true");
  const frame = page.locator("[data-desktop-frame] > div");
  await expect(async () => {
    expect(await frame.evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(0);
  }).toPass();

  const baseline = await frame.evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
    scrollTop: element.scrollTop,
  }));
  const samples = frame.evaluate(
    (element) =>
      new Promise<{ width: number; height: number; scrollHeight: number; scrollTop: number }[]>(
        (resolve) => {
          const values: {
            width: number;
            height: number;
            scrollHeight: number;
            scrollTop: number;
          }[] = [];
          const started = performance.now();
          const sample = () => {
            values.push({
              width: element.clientWidth,
              height: element.clientHeight,
              scrollHeight: element.scrollHeight,
              scrollTop: element.scrollTop,
            });
            if (performance.now() - started < 700) requestAnimationFrame(sample);
            else resolve(values);
          };
          sample();
        },
      ),
  );
  await toast.getByRole("button", { name: "Close", exact: true }).click();
  await expect(toast).toHaveCount(0);
  for (const sample of await samples) {
    expect(sample).toEqual({ ...baseline, scrollHeight: baseline.height });
  }
});
