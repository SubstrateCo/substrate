import { actors } from "../../../core/actors/schema";
import { userAgents } from "../../../core/actors/user-agents.schema";
import type { DatabaseExecutor } from "../../../core/executor";
import { messagingMessages } from "../../messaging/schema";
import { agentSessions } from "../sessions.schema";
import type { MessageTrigger } from "./admission";
import { wakeSessionKey } from "./wake-kind";
import { and, eq, exists, isNotNull, or, sql } from "drizzle-orm";

/**
 * A candidate joined this exact thread through admitted work, not conversation membership: it
 * has a session for the thread, or published a reply in it.
 */
export function threadParticipation(db: DatabaseExecutor, trigger: MessageTrigger) {
  const { message } = trigger;
  if (!message.threadId || trigger.conversationKind === "dm") return sql<boolean>`false`;
  const session = exists(
    db
      .select({ id: agentSessions.id })
      .from(agentSessions)
      .where(
        and(
          eq(agentSessions.userAgentId, userAgents.id),
          eq(agentSessions.organizationId, trigger.organizationId),
          eq(agentSessions.agentActorEntityId, actors.entityId),
          eq(agentSessions.key, wakeSessionKey(trigger.conversationKind, message)),
        ),
      ),
  );
  const replied = exists(
    db
      .select({ id: messagingMessages.id })
      .from(messagingMessages)
      .where(
        and(
          eq(messagingMessages.conversationId, message.conversationId),
          eq(messagingMessages.authorActorEntityId, actors.entityId),
          or(
            eq(messagingMessages.id, message.threadId),
            eq(messagingMessages.threadId, message.threadId),
          ),
          isNotNull(messagingMessages.originTurnId),
        ),
      ),
  );
  return sql<boolean>`(${session} OR ${replied})`;
}
