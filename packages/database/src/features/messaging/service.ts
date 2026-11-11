import type { DatabaseExecutor } from "../../client";
import type { SessionIdentity } from "../../core/session/identity";
import { conversationOperations } from "./conversations";
import { messageMutationOperations } from "./message-mutations";
import { messageOperations } from "./messages";
import { reactionOperations } from "./reactions";
import { readOperations } from "./read-state";

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
    ...messageMutationOperations(db, scope),
    ...reactionOperations(db, scope),
    ...readOperations(db, scope),
  };
}
