import { appOrigin } from "./integration/test-support/environment";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./integration",
  fullyParallel: true,
  workers: 4,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "./scripts/errors-reporter.ts",
  use: {
    baseURL: appOrigin,
    // Auth and signed storage URLs contain credentials.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
