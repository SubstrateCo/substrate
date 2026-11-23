import { expectTimeout } from "./e2e/test-support/timeouts";
import { defineConfig } from "@playwright/test";

const baseURL = "http://localhost:3100";
const apiURL = "http://localhost:3101";
// Existing API provisioning helpers use the same trusted renderer origin.
process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.PLAYWRIGHT_API_URL = apiURL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: Number(process.env.E2E_WORKERS ?? 4),
  timeout: 15_000,
  expect: { timeout: expectTimeout },
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["./e2e/test-support/timing-reporter.ts"], ["html", { open: "never" }]],
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 900 },
    // Functional workflows do not need to wait for decorative transitions.
    reducedMotion: "reduce",
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    // Auth cookies and signed URLs can appear in traces. Do not collect them by default.
    trace: "off",
    // Set E2E_RECORD_VIDEO to record workflow videos; recording slows every test.
    video: process.env.E2E_RECORD_VIDEO ? "on" : "off",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "bun scripts/start-e2e.ts",
      cwd: "../server",
      url: `${apiURL}/api/auth/ok`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        REALTIME_CHANNEL: "substrate:realtime:e2e",
        DATABASE_URL:
          process.env.E2E_DATABASE_URL ??
          "postgres://substrate_e2e:substrate_e2e@localhost:5434/substrate_e2e_test",
        SUBSTRATE_API_URL: apiURL,
        SUBSTRATE_WEB_URL: baseURL,
        SUBSTRATE_WINDOWS_DOWNLOAD_URL: "https://downloads.example.test/Substrate.exe",
        BETTER_AUTH_SECRET: "substrate-e2e-only-secret-not-for-production",
        GOOGLE_CLIENT_ID: "substrate-e2e-google-client",
        GOOGLE_CLIENT_SECRET: "substrate-e2e-google-secret",
        SMTP_HOST: "localhost",
        SMTP_PORT: "1025",
        SMTP_SECURE: "false",
        SMTP_USER: "",
        SMTP_PASSWORD: "",
        EMAIL_FROM: "Substrate E2E <e2e@example.test>",
      },
    },
    {
      command: "bun run dev",
      url: baseURL,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        SUBSTRATE_WEB_URL: baseURL,
        SUBSTRATE_API_URL: apiURL,
        VITE_CACHE_DIR: "node_modules/.vite-e2e",
        E2E_WARMUP: "1",
      },
    },
  ],
});
