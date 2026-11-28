import { audienceRecipients, resolveReceivers } from "@substrate/database/realtime";
import type { Database } from "@substrate/database/trusted";

import { createRealtimeAuthenticator } from "../../auth/realtime-session";
import type { Auth } from "../../auth/server";
import { createRealtimeHub, type Change } from "./hub";
import { coalesceReceivers } from "./receivers";
import { createRealtimeSubscription } from "./subscription";

export function createRealtimeService({
  db,
  auth,
  onChanges,
}: {
  db: Database;
  auth: Auth;
  /** Sees every batch that any server published, before its receivers do. */
  onChanges?: (changes: Change[]) => void;
}) {
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
    receive: (changes) => {
      onChanges?.(changes);
      return hub.publish(...changes);
    },
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
