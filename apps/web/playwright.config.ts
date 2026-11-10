import { defineConfig } from "@playwright/test";

const baseURL = "http://localhost:3100";
const apiURL = "http://localhost:3101";
// Existing API provisioning helpers use the same trusted renderer origin.
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: Number(process.env.E2E_WORKERS ?? 4),
  timeout: 15_000,
  expect: { timeout: 5_000 },
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["./e2e/test-support/timing-reporter.ts"], ["html", { open: "never" }]],
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    // Auth cookies and signed URLs can appear in traces. Do not collect them by default.
    trace: "off",
    video: "off",
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
        REALTIME_CHANNEL: "startup-os:realtime:e2e",
        DATABASE_URL:
          process.env.E2E_DATABASE_URL ??
          "postgres://startup_os_e2e:startup_os_e2e@localhost:5434/startup_os_e2e_test",
        SERVER_PORT: "3101",
        BETTER_AUTH_URL: apiURL,
        APP_URL: baseURL,
        FRONTEND_ORIGINS: `${baseURL},https://desktop.startup-os.local`,
        STARTUP_OS_WINDOWS_DOWNLOAD_URL: "https://downloads.example.test/StartupOS.exe",
        BETTER_AUTH_SECRET: "startup-os-e2e-only-secret-not-for-production",
        SMTP_HOST: "localhost",
        SMTP_PORT: "1025",
        SMTP_SECURE: "false",
        SMTP_USER: "",
        SMTP_PASSWORD: "",
        EMAIL_FROM: "Startup OS E2E <e2e@example.test>",
      },
    },
    {
      command: "bun run dev",
      url: baseURL,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { WEB_PORT: "3100", SERVER_URL: apiURL, VITE_CACHE_DIR: "node_modules/.vite-e2e" },
    },
  ],
});
