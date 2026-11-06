import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 8,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:6007",
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    screenshot: "only-on-failure",
    trace: "off",
  },
  webServer: {
    command: "bunx storybook dev --host 127.0.0.1 --port 6007 --ci --no-open --disable-telemetry",
    env: { STORYBOOK_HEADLESS: "true", NODE_ENV: "production" },
    url: "http://127.0.0.1:6007/index.json",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "ignore",
  },
});
