import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

const baseURL = process.env.MOBILE_E2E_URL ?? "http://localhost:8081";
const apiURL = process.env.MOBILE_E2E_API_URL ?? "http://localhost:3101";
const databaseURL =
  process.env.E2E_DATABASE_URL ??
  "postgres://substrate_e2e:substrate_e2e@localhost:5434/substrate_e2e_test";

for (const value of [baseURL, apiURL]) {
  if (!["localhost", "127.0.0.1"].includes(new URL(value).hostname))
    throw new Error("Mobile capture must use local E2E services, never a live workspace.");
}
if (!new URL(databaseURL).pathname.endsWith("_e2e_test"))
  throw new Error("Mobile capture requires the dedicated _e2e_test database.");

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results/mobile-review/playwright",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  use: {
    baseURL,
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "no-preference",
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "expo-web-preview-light", use: { colorScheme: "light" } },
    { name: "expo-web-preview-dark", use: { colorScheme: "dark" } },
  ],
  // Root scripts own process startup. Never silently attach capture to a developer's API.
  webServer: services(),
});

function services(): PlaywrightTestConfig["webServer"] {
  if (process.env.MOBILE_E2E_EXTERNAL_SERVICES === "1") return undefined;
  const startCommand = process.env.MOBILE_E2E_START_COMMAND;
  if (startCommand)
    return {
      command: startCommand,
      cwd: "../..",
      url: baseURL,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NODE_ENV: "test",
        E2E_DATABASE_URL: databaseURL,
        MOBILE_E2E_API_URL: apiURL,
        MOBILE_E2E_URL: baseURL,
      },
    };
  return [
    {
      command: "bun apps/server/scripts/start-e2e.ts",
      cwd: "../..",
      url: `${apiURL}/api/auth/ok`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: "test",
        DATABASE_URL: databaseURL,
        SUBSTRATE_API_URL: apiURL,
        SERVER_PORT: new URL(apiURL).port,
        SUBSTRATE_WEB_URL: baseURL,
        FRONTEND_ORIGINS: baseURL,
        REALTIME_CHANNEL: "substrate:realtime:mobile-e2e",
        SUBSTRATE_WINDOWS_DOWNLOAD_URL: "https://downloads.example.test/Substrate.exe",
        BETTER_AUTH_SECRET: "substrate-mobile-e2e-only-secret-not-for-production",
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
      command: "bun run dev:mobile:web --clear",
      cwd: "../..",
      url: baseURL,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        EXPO_PUBLIC_API_URL: apiURL,
        EXPO_PUBLIC_WEB_URL: baseURL,
        BROWSER: "none",
      },
    },
  ];
}
