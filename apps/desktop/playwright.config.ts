import { defineConfig } from "@playwright/test";
import { applicationURL } from "./src/navigation.js";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: { trace: "off", screenshot: "off", video: "off" },
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
