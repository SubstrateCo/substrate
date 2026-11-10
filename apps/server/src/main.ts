import { pruneRecords } from "@startup-os/database/maintenance";

import { createApp } from "./app";
import { closeDatabase, db } from "./auth/database";
// Parsed once on import: an invalid environment stops startup before the app is created.
import { environment } from "./environment";
import { closeMail } from "./mail/service";
import { defaultFileService } from "./v1/files/default-service";
import { startSharingMail } from "./v1/messaging/sharing-mail";
import { closeRefreshPublisher } from "./v1/realtime/publisher";
import { createRealtimeService } from "./v1/realtime/service";

const app = createApp();
const realtime = createRealtimeService();
await realtime.start();
const stopSharingMail = startSharingMail();
const server = Bun.serve({
  port: environment.port,
  websocket: realtime.websocket,
  fetch(request, server) {
    // Upgrade responses must not pass through response-mutating HTTP middleware.
    if (new URL(request.url).pathname === "/api/v1/realtime")
      return realtime.app.fetch(request, server);
    return app.fetch(request, server);
  },
});
console.log(`Startup OS API listening on ${server.url}`);

let cleaning = false;
// Hourly: storage objects, then records nothing reads any more.
async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  try {
    await defaultFileService.cleanup();
  } catch (error) {
    console.error("Storage cleanup failed", error instanceof Error ? error.name : "Unknown error");
  }
  try {
    await pruneRecords(db);
  } catch (error) {
    console.error("Record cleanup failed", error instanceof Error ? error.name : "Unknown error");
  } finally {
    cleaning = false;
  }
}
void cleanup();
const cleanupTimer = setInterval(() => void cleanup(), 60 * 60_000);
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
    .then(() => stopSharingMail())
    .then(() => closeMail())
    .then(() => closeDatabase())
    .catch(() => {
      console.error("Server shutdown failed");
      process.exitCode = 1;
    });
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
