import type { DatabaseExecutor } from "../../core/executor";
import type { SessionIdentity } from "../../core/session/identity";
import {
  messagingSession,
  resolvedMessagingSession,
  type MessagingSessionResolver,
} from "../../core/session/messaging";
import type { ResolvedWorkspace } from "../../core/session/workspace";
import { conversationOperations } from "./conversations";
import { messageMutationOperations } from "./message-mutations";
import { messageOperations } from "./messages";
import { reactionOperations } from "./reactions";
import { readOperations } from "./read-state";

// Trusted server facade: identity and active organization must come from the session.
function messagingOperations(
  db: DatabaseExecutor,
  authenticatedScope: SessionIdentity,
  authenticate: MessagingSessionResolver,
) {
  const scope = Object.freeze({
    userId: authenticatedScope.userId,
    organizationId: authenticatedScope.organizationId,
    actorEntityId: authenticatedScope.actorEntityId,
  });
  return {
    ...conversationOperations(db, scope, authenticate),
    ...messageOperations(db, scope, authenticate),
    ...messageMutationOperations(db, scope, authenticate),
    ...reactionOperations(db, scope, authenticate),
    ...readOperations(db, scope, authenticate),
  };
}

export function createMessagingRepository(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  resolved: ResolvedWorkspace,
) {
  return messagingOperations(db, scope, async (tx) =>
    resolvedMessagingSession(tx, scope, resolved),
  );
}

// Trusted non-HTTP entry point. Resolve once at the start of each operation.
export function createMessagingService(db: DatabaseExecutor, scope: SessionIdentity) {
  return messagingOperations(db, scope, (tx) => messagingSession(tx, scope));
}
