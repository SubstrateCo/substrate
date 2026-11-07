import { test as desktopTest } from "./fixture.js";
import { createRealtimeServer } from "./realtime-server.js";

export const test = desktopTest.extend<{
  realtimeServer: Awaited<ReturnType<typeof createRealtimeServer>>;
}>({
  realtimeServer: [
    // oxlint-disable-next-line eslint/no-empty-pattern -- Playwright requires a destructured dependency parameter even when this fixture has none.
    async ({}, use) => {
      const server = await createRealtimeServer();
      try {
        await use(server);
      } finally {
        await server.close();
      }
    },
    { timeout: 90_000 },
  ],
  baseURL: async ({ realtimeServer }, use) => {
    await use(realtimeServer.webOrigin);
  },
  desktopEnvironment: async ({ realtimeServer }, use) => {
    await use(realtimeServer.environment);
  },
});
