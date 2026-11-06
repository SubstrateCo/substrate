import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "./e2e/test-results",
  fullyParallel: true,
  workers: 6,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  projects: [
    {
      name: "accounts",
      testMatch: /workspace\.spec\.ts$/,
    },
    {
      name: "workflows",
      testMatch: /(?:messaging|tasks-sharing)\.spec\.ts$/,
    },
    {
      name: "screens",
      testIgnore: /(?:messaging|tasks-sharing|workspace)\.spec\.ts$/,
    },
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    browserName: "chromium",
    reducedMotion: "reduce",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    // Email links contain credentials. Do not retain them in browser artifacts.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
