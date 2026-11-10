import type { DatabaseExecutor } from "../../../client";
import type { MessagingIdentity } from "../access";
import { connectionOperations } from "./connections";
import { invitationOperations } from "./invitations";
import { sharingQueries } from "./queries";

// Trusted server facade for cross-organization sharing.
export function createSharingService(db: DatabaseExecutor, scope: MessagingIdentity) {
  return {
    ...sharingQueries(db, scope),
    ...invitationOperations(db, scope),
    ...connectionOperations(db, scope),
  };
}
