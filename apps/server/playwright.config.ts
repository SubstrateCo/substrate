import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./integration",
  fullyParallel: true,
  workers: 4,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    // Auth and signed storage URLs contain credentials.
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
