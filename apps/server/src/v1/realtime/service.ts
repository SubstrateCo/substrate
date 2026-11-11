import { audienceRecipients, resolveReceiver } from "@substrate/database/realtime";

import { db } from "../../auth/database";
import { auth } from "../../auth/server";
import { environment } from "../../environment";
import { createRealtimeHub } from "./hub";
import { createRealtimeRoutes } from "./routes";
import { createRealtimeAuthenticator } from "./session";
import { createRealtimeSubscription } from "./subscription";

export function createRealtimeService() {
  let failures = 0;
  const hub = createRealtimeHub({
    authenticate: createRealtimeAuthenticator(auth.api, (identity) =>
      resolveReceiver(db, identity),
    ),
    recipients: (audience) => audienceRecipients(db, audience),
    reportFailure: () => {
      failures++;
      console.warn("Realtime operation failed; client resync required", { failures });
    },
  });
  const routes = createRealtimeRoutes(hub, environment.trustedOrigins);
  const subscription = createRealtimeSubscription({
    receive: (changes) => hub.publish(...changes),
    setAvailable: (available) => hub.setAvailable(available),
  });
  return {
    ...routes,
    hub,
    async start() {
      await subscription.start();
      hub.start();
    },
    stop() {
      subscription.stop();
      hub.stop();
    },
  };
}
