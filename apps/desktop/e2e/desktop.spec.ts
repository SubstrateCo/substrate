import { _electron as electron, expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { applicationURL } from "../src/navigation.js";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);

test("loads the existing app in an isolated desktop window", async () => {
  test.skip(Boolean(process.env.DESKTOP_EXECUTABLE_PATH), "Source development smoke test.");
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "ELECTRON_RUN_AS_NODE") env[key] = value;
  }
  env.STARTUP_OS_TEST_ID = randomUUID();
  const desktop = await electron.launch({
    args: [fileURLToPath(new URL("../src/main.js", import.meta.url)), "--desktop-smoke-test"],
    env,
  });
  try {
    const page = await desktop.firstWindow();
    await expect(page).toHaveURL(
      (url) => url.origin === applicationURL && url.pathname === "/login",
    );
    await expect(
      page.getByRole("button", { name: "Sign in with browser", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.minimize());
    await expect
      .poll(() =>
        desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized()),
      )
      .toBe(true);
    const executable = await desktop.evaluate(() => process.execPath);
    const second = await execFileAsync(
      executable,
      [fileURLToPath(new URL("../src/main.js", import.meta.url)), "--desktop-smoke-test"],
      {
        env,
        timeout: 10_000,
      },
    );
    expect(second.stdout).toContain("Startup OS is already running");
    await expect
      .poll(() =>
        desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized()),
      )
      .toBe(false);
    expect(desktop.windows()).toHaveLength(1);
    expect(await page.evaluate("typeof require")).toBe("undefined");
    expect(await page.evaluate("globalThis.process?.versions?.node")).toBeUndefined();
    await expect(page).toHaveURL(/\/login/);
    expect(desktop.windows()).toHaveLength(1);
    await page.evaluate(() => {
      window.location.href = "data:text/html,unsafe";
    });
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("button", { name: "Sign in with browser", exact: true }),
    ).toBeVisible();
    await desktop.evaluate(
      async ({ BrowserWindow }, path) => {
        await BrowserWindow.getAllWindows()[0]!.loadFile(path);
      },
      fileURLToPath(new URL("../src/offline.html", import.meta.url)),
    );
    await expect(
      page.getByRole("heading", { name: "Cannot connect to Startup OS", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Try again", exact: true }).click();
    await expect(page).toHaveURL(
      (url) => url.origin === applicationURL && url.pathname === "/login",
    );
  } finally {
    await desktop.close();
  }
});
