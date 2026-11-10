import type { DatabaseExecutor } from "../../client";
import type { MessagingIdentity } from "./access";
import { conversationOperations } from "./conversations";
import { messageOperations } from "./messages";

// Trusted server facade: identity and active organization must come from the session.
export function createMessagingService(
  db: DatabaseExecutor,
  authenticatedScope: MessagingIdentity,
) {
  const scope = Object.freeze({
    userId: authenticatedScope.userId,
    organizationId: authenticatedScope.organizationId,
    actorEntityId: authenticatedScope.actorEntityId,
  });
  return { ...conversationOperations(db, scope), ...messageOperations(db, scope) };
}
