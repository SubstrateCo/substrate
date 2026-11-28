import { appOrigin } from "./integration/test-support/environment";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./integration",
  fullyParallel: true,
  workers: 4,
  timeout: 20_000,
  expect: { timeout: 15_000 },
  reporter: "./scripts/errors-reporter.ts",
  use: {
    baseURL: appOrigin,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
