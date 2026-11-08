import { applicationURL } from "./src/shell/navigation.js";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // The desktop fixture isolates renderer focus and native sessions per test.
  workers: 4,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "./e2e/test-support/errors-reporter.ts",
  projects: [
    { name: "functional", grepInvert: /@layout/ },
    { name: "layout", grep: /@layout/ },
  ],
  use: {
    baseURL: applicationURL,
    trace: "off",
    screenshot: "off",
    video: "off",
    browserName: "chromium",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  webServer: process.env.DESKTOP_EXECUTABLE_PATH
    ? undefined
    : {
        command: "bun run dev",
        cwd: "../..",
        url: `${applicationURL}/login`,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
