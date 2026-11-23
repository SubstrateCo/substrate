import { invocationMachine } from "@substrate/contracts/agent-work";

import { actors } from "../../../core/actors/schema";
import { userAgents } from "../../../core/actors/user-agents.schema";
import type { DatabaseExecutor } from "../../../core/executor";
import { messagingMessages } from "../../messaging/schema";
import type { MessageTrigger } from "./admission";
import { agentInvocations } from "../calls/invocations.schema";
import { wakeSessionKey } from "./wake-kind";
import { agentWakes } from "./wakes.schema";
import { and, eq, exists, inArray, isNotNull, or, sql } from "drizzle-orm";

/** A candidate joined this exact thread through admitted work, not conversation membership.
 * Published replies retain that evidence after acknowledged wakes are cleaned up.
 */
export function threadParticipation(db: DatabaseExecutor, trigger: MessageTrigger) {
  const { message } = trigger;
  if (!message.threadId || trigger.conversationKind === "dm") return sql<boolean>`false`;
  const sessionKey = wakeSessionKey(trigger.conversationKind, message);
  const woke = exists(
    db
      .select({ id: agentWakes.id })
      .from(agentWakes)
      .where(
        and(
          eq(agentWakes.organizationId, trigger.organizationId),
          eq(agentWakes.userAgentId, userAgents.id),
          eq(agentWakes.agentActorEntityId, actors.entityId),
          eq(agentWakes.sessionKey, sessionKey),
          inArray(agentWakes.source, ["owner_message", "caller_message"]),
        ),
      ),
  );
  const admitted = exists(
    db
      .select({ id: agentInvocations.id })
      .from(agentInvocations)
      .where(
        and(
          eq(agentInvocations.organizationId, trigger.organizationId),
          eq(agentInvocations.userAgentId, userAgents.id),
          eq(agentInvocations.agentActorEntityId, actors.entityId),
          eq(agentInvocations.conversationId, message.conversationId),
          eq(agentInvocations.sessionKey, sessionKey),
          eq(agentInvocations.status, invocationMachine.events.admit.to),
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
  return sql<boolean>`(${woke} OR ${admitted} OR ${replied})`;
}
