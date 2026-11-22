import type { DatabaseExecutor } from "../../core/executor";
import type { SessionIdentity } from "../../core/session/identity";
import {
  messagingSession,
  resolvedMessagingSession,
  type MessagingReader,
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
  read: MessagingReader,
) {
  const scope = Object.freeze({
    userId: authenticatedScope.userId,
    organizationId: authenticatedScope.organizationId,
    actorEntityId: authenticatedScope.actorEntityId,
  });
  return {
    ...conversationOperations(db, scope, authenticate, read),
    ...messageOperations(db, scope, authenticate, read),
    ...messageMutationOperations(db, scope, authenticate),
    ...reactionOperations(db, scope, authenticate, read),
    ...readOperations(db, scope, authenticate),
  };
}

// The resolved workspace runs no statement, so reads need no transaction.
export function createMessagingRepository(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  resolved: ResolvedWorkspace,
) {
  return messagingOperations(
    db,
    scope,
    async (tx) => resolvedMessagingSession(tx, scope, resolved),
    (work) => work(db),
  );
}

// Trusted non-HTTP entry point. Resolve once at the start of each operation. A read keeps its
// transaction: resolving may provision an actor, which a later failure rolls back.
export function createMessagingService(db: DatabaseExecutor, scope: SessionIdentity) {
  return messagingOperations(
    db,
    scope,
    (tx) => messagingSession(tx, scope),
    (work) => db.transaction(work),
  );
}
