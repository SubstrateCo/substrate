import { desktopOrigin } from "@startup-os/contracts/desktop/links";
import { acknowledgeChanges, canReceiveChange, readChanges } from "@startup-os/database/realtime";

import { db } from "../../auth/database";
import { authEnvironment } from "../../auth/environment";
import { auth } from "../../auth/server";
import { createRealtimeHub } from "./hub";
import { createRealtimeRoutes } from "./routes";
import { createRealtimeAuthenticator } from "./session";

export function createRealtimeService() {
  let failures = 0;
  const hub = createRealtimeHub({
    authenticate: createRealtimeAuthenticator(auth.api, (identity, audience) =>
      canReceiveChange(db, identity, audience),
    ),
    canReceive: (identity, audience) => canReceiveChange(db, identity, audience),
    readChanges: async () => await readChanges(db, 100),
    acknowledgeChanges: (ids) => acknowledgeChanges(db, ids),
    reportFailure: () => {
      failures++;
      console.warn("Realtime operation failed; dispatch will retry", { failures });
    },
  });
  const routes = createRealtimeRoutes(hub, [
    ...new Set([...authEnvironment().trustedOrigins, desktopOrigin]),
  ]);
  return { ...routes, hub };
}
