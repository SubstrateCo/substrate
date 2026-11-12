import { createRepositories } from "@substrate/database";
import { pruneRecords, touchDevice } from "@substrate/database/trusted";

import { createApp } from "./app";
import { createAuthPublisher } from "./auth/realtime";
import { createAuth } from "./auth/server";
// Parsed once on import: an invalid environment stops startup before the app is created.
import { environment } from "./environment";
import { createServerDatabase } from "./infrastructure/database";
import { createRuntimeMetrics } from "./infrastructure/runtime-metrics";
import { createSmtpMail } from "./mail/service";
import { createServices } from "./services";
import { createScopes } from "./shared/scope";
import { createS3Storage } from "./storage/s3";
import { createSharingMail } from "./v1/messaging/sharing-mail";
import { createCommittedPublisher } from "./v1/realtime/committed";
import { createRedisPublisher } from "./v1/realtime/publisher";
import { createRealtimeService } from "./v1/realtime/service";

const { db, close: closeDatabase } = createServerDatabase();
const { mail, close: closeMail } = createSmtpMail();
const refresh = createRedisPublisher();
// The worker needs the committed publisher, while publication wakes that same worker.
// No work starts until both have been constructed.
const publish = createCommittedPublisher({
  publish: refresh.publish,
  sharingMail: { trigger: () => sharingMail.worker.trigger() },
});
const sharingMail = createSharingMail({ db, mail, publish });
const auth = createAuth({ db, mail, publish, realtime: createAuthPublisher(db, publish) });
const storage = createS3Storage();
const services = createServices({ db, storage, publish });
const scopes = createScopes({
  api: auth.api,
  repositories: createRepositories(db),
  checkDevice: async (userId, installationId) => {
    await touchDevice(db, userId, installationId);
  },
});
const realtime = createRealtimeService({ db, auth });
const metrics = createRuntimeMetrics(environment.serverMetrics, environment.databasePoolSize);
const app = createApp({
  auth,
  services,
  scopes,
  trustedOrigins: environment.trustedOrigins,
  realtime,
  metrics,
});
await realtime.start();
const stopSharingMail = sharingMail.start();
const server = Bun.serve({
  port: environment.port,
  websocket: realtime.websocket,
  fetch: app.fetch,
});
console.log(`Substrate API listening on ${server.url}`);

let cleaning = false;
// Hourly: storage objects, then records nothing reads any more.
async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  try {
    await services.files.cleanup();
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
  metrics?.close();
  realtime.stop();
  void server
    .stop(true)
    .then(() => stopSharingMail())
    .then(() => refresh.close())
    .then(() => closeMail())
    .then(() => closeDatabase())
    .catch(() => {
      console.error("Server shutdown failed");
      process.exitCode = 1;
    });
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
