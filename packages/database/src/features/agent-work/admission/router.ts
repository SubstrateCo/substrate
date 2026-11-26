import type { ConversationKind } from "@substrate/contracts/messaging/input";
import type { RealtimeHint } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../../core/executor";
import type { SessionIdentity } from "../../../core/session/identity";
import type { messagingMessages } from "../../messaging/schema";
import { admit } from "./admission";

/**
 * Creates the agent work that this message admits. Call in the transaction that inserts the
 * message, so a committed message always has its work items. Returns realtime hints to publish
 * after commit. The rules are in decideAdmission.
 */
export async function routeMessage(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  message: typeof messagingMessages.$inferSelect,
  conversationKind: ConversationKind,
): Promise<RealtimeHint[]> {
  const { hints } = await admit(db, [
    {
      type: "message",
      organizationId: scope.organizationId,
      // Without an actor in scope, the author is the session user's human actor.
      author: scope.actorEntityId
        ? { kind: "agent", actorEntityId: scope.actorEntityId }
        : { kind: "human", userId: scope.userId },
      message,
      conversationKind,
    },
  ]);
  return hints;
}
