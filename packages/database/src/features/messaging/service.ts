import type { DatabaseExecutor } from "../../client";
import type { SessionIdentity } from "../../core/session/identity";
import { conversationOperations } from "./conversations";
import { messageOperations } from "./messages";
import { reactionOperations } from "./reactions";

// Trusted server facade: identity and active organization must come from the session.
export function createMessagingService(db: DatabaseExecutor, authenticatedScope: SessionIdentity) {
  const scope = Object.freeze({
    userId: authenticatedScope.userId,
    organizationId: authenticatedScope.organizationId,
    actorEntityId: authenticatedScope.actorEntityId,
  });
  return {
    ...conversationOperations(db, scope),
    ...messageOperations(db, scope),
    ...reactionOperations(db, scope),
  };
}
