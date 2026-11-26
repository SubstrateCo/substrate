import { createRepositories } from "@substrate/database";
import { claimOutbox, finishOutbox, pruneRecords, recordOutbox } from "@substrate/database/trusted";

import { createApp } from "./app";
import { createGoogleLinkTickets } from "./auth/google-link";
import { createAuthPublisher } from "./auth/realtime";
import { createAuth } from "./auth/server";
import { createSessionApi } from "./auth/session-api";
// Parsed once on import: an invalid environment stops startup before the app is created.
import { environment } from "./environment";
import { createServerDatabase } from "./infrastructure/database";
import { createSmtpMail } from "./mail/service";
import { createServices } from "./services";
import { createCommittedPublisher } from "./shared/committed";
import { createScopes } from "./shared/scope";
import { createS3Storage } from "./storage/s3";
import { createCalendarProviders } from "./v1/calendar/providers";
import { createCalendarSync } from "./v1/calendar/sync";
import { createSharpImageCodec } from "./v1/files/image";
import { createSharingMail } from "./v1/messaging/sharing-mail";
import { createOutboxRelay } from "./v1/realtime/outbox-relay";
import { createRedisPublisher } from "./v1/realtime/publisher";
import { createRealtimeRoutes } from "./v1/realtime/routes";
import { createRealtimeService } from "./v1/realtime/service";

const { db, close: closeDatabase } = createServerDatabase();
const { mail, close: closeMail } = createSmtpMail();
const refresh = createRedisPublisher({
  record: async (hints) => {
    await recordOutbox(db, hints);
  },
  finish: (id) => finishOutbox(db, id),
});
const outboxRelay = createOutboxRelay({
  claim: () => claimOutbox(db),
  send: refresh.send,
  finish: (id) => finishOutbox(db, id),
  reportFailure: (message) => console.warn(message),
});
// The worker needs the committed publisher, while publication wakes that same worker.
// No work starts until both have been constructed.
const publish = createCommittedPublisher({
  publish: refresh.publish,
  sharingMail: { trigger: () => sharingMail.worker.trigger() },
});
const sharingMail = createSharingMail({ db, mail, publish });
const auth = createAuth({ db, mail, publish, realtime: createAuthPublisher(db, publish) });
const storage = createS3Storage();
const calendarProviders = createCalendarProviders(environment.calendarProviders, auth);
const calendarSync = createCalendarSync({ db, publish, providers: calendarProviders });
const services = createServices({
  db,
  storage,
  images: createSharpImageCodec(),
  publish,
  apiURL: environment.apiURL,
  desktop: {
    desktopScheme: environment.desktopScheme,
    webURL: environment.webURL,
    windowsDownloadURL: environment.windowsDownloadURL,
    macDownloadURL: environment.macDownloadURL,
  },
  calendar: {
    providers: calendarProviders,
    triggerSync: () => calendarSync.worker.trigger(),
  },
  googleLink: createGoogleLinkTickets(auth, { apiURL: environment.apiURL }),
});
const scopes = createScopes({
  api: createSessionApi(auth.api),
  repositories: createRepositories(db),
});
const realtime = createRealtimeService({ db, auth });
const realtimeRoutes = createRealtimeRoutes(realtime.hub, environment.trustedOrigins);
const app = createApp({
  auth,
  services,
  scopes,
  trustedOrigins: environment.trustedOrigins,
  realtime: realtimeRoutes,
});
await realtime.start();
const stopSharingMail = sharingMail.start();
const stopCalendarSync = calendarSync.start();
const stopOutboxRelay = outboxRelay.start();
const server = Bun.serve({
  port: environment.port,
  websocket: realtimeRoutes.websocket,
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
  realtime.stop();
  void server
    .stop(true)
    .then(() => stopSharingMail())
    .then(() => stopCalendarSync())
    .then(() => stopOutboxRelay())
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
