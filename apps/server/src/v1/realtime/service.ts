import { audienceRecipients, resolveReceivers } from "@substrate/database/realtime";
import type { Database } from "@substrate/database/trusted";

import { createRealtimeAuthenticator } from "../../auth/realtime-session";
import type { Auth } from "../../auth/server";
import { createRealtimeHub } from "./hub";
import { coalesceReceivers } from "./receivers";
import { createRealtimeSubscription } from "./subscription";

export function createRealtimeService({ db, auth }: { db: Database; auth: Auth }) {
  let failures = 0;
  const hub = createRealtimeHub({
    authenticate: createRealtimeAuthenticator(
      auth.api,
      coalesceReceivers((identities) => resolveReceivers(db, identities)),
    ),
    recipients: (audience) => audienceRecipients(db, audience),
    reportFailure: () => {
      failures++;
      console.warn("Realtime operation failed; client resync required", { failures });
    },
  });
  const subscription = createRealtimeSubscription({
    receive: (changes) => hub.publish(...changes),
    setAvailable: (available) => hub.setAvailable(available),
  });
  return {
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
