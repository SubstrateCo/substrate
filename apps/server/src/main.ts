import { createApp } from "./app";
import { closeDatabase } from "./auth/database";
import { defaultFileService } from "./v1/files/default-service";
import { closeRefreshPublisher } from "./v1/realtime/publisher";
import { createRealtimeService } from "./v1/realtime/service";

const port = Number(process.env.SERVER_PORT ?? "3001");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("SERVER_PORT must be a valid port.");
}

const app = createApp();
const realtime = createRealtimeService();
await realtime.start();
const server = Bun.serve({
  port,
  websocket: realtime.websocket,
  fetch(request, server) {
    // Upgrade responses must not pass through response-mutating HTTP middleware.
    if (new URL(request.url).pathname === "/api/v1/realtime")
      return realtime.app.fetch(request, server);
    return app.fetch(request, server);
  },
});
console.log(`Startup OS API listening on ${server.url}`);

let cleaningStorage = false;
async function cleanupStorage() {
  if (cleaningStorage) return;
  cleaningStorage = true;
  try {
    await defaultFileService.cleanup();
  } catch (error) {
    console.error("Storage cleanup failed", error instanceof Error ? error.name : "Unknown error");
  } finally {
    cleaningStorage = false;
  }
}
void cleanupStorage();
const cleanupTimer = setInterval(() => void cleanupStorage(), 60 * 60_000);
cleanupTimer.unref();

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(cleanupTimer);
  realtime.stop();
  closeRefreshPublisher();
  void server
    .stop(true)
    .then(() => closeDatabase())
    .catch(() => {
      console.error("Server shutdown failed");
      process.exitCode = 1;
    });
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
