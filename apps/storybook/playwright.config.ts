import { defineConfig } from "@playwright/test";
import { availablePort } from "../../scripts/testing/server";

const externalURL = process.env.STORYBOOK_TEST_BASE_URL;
const port = externalURL
  ? undefined
  : (process.env.STORYBOOK_TEST_PORT ?? String(await availablePort()));
if (port) process.env.STORYBOOK_TEST_PORT = port;
const baseURL = externalURL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 8,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    reuseContext: true,
    serviceWorkers: "block",
    baseURL,
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    screenshot: "only-on-failure",
    trace: "off",
  },
  webServer: externalURL
    ? undefined
    : {
        command:
          process.env.STORYBOOK_TEST_STATIC === "true"
            ? `bun ../../scripts/testing/serve-storybook.ts ${port}`
            : `bunx storybook dev --host 127.0.0.1 --port ${port} --ci --no-open --disable-telemetry`,
        env: { STORYBOOK_HEADLESS: "true", NODE_ENV: "production" },
        url: `${baseURL}/index.json`,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
