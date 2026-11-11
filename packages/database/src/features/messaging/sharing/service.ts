import type { DatabaseExecutor } from "../../../client";
import type { SessionIdentity } from "../../../core/session/identity";
import { connectionOperations } from "./connections";
import { invitationOperations } from "./invitations";
import { sharingQueries } from "./queries";

// Trusted server facade for cross-organization sharing.
export function createSharingService(db: DatabaseExecutor, scope: SessionIdentity) {
  return {
    ...sharingQueries(db, scope),
    ...invitationOperations(db, scope),
    ...connectionOperations(db, scope),
  };
}
