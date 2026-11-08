import type { AgentTriggerKind } from "@startup-os/contracts/agent-runs";

import type { DatabaseExecutor } from "../../client";
import { activeActorCondition } from "../../core/actors/access";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { userAgentTriggers } from "../agents/triggers.schema";
import { messageReferences } from "../context/references";
import type { MessagingIdentity } from "../messaging/access";
import { messagingMessages, messagingParticipants } from "../messaging/schema";
import { agentRunTriggers, agentRuns } from "./schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

/**
 * Queues runs for the author's own agents that this message addresses. Call in the transaction
 * that inserts the message, so a committed message always has its runs.
 *
 * Only the agent's owner can trigger it: the agent works on the owner's computer with the owner's
 * access. Agent-written messages never trigger, which also stops agent-to-agent loops.
 * Each agent gets at most one trigger per message: mention, then DM, then thread reply.
 */
export async function queueAgentTriggers(
  db: DatabaseExecutor,
  scope: MessagingIdentity,
  message: typeof messagingMessages.$inferSelect,
  conversationKind: "dm" | "group" | "channel",
): Promise<number> {
  if (scope.actorEntityId) return 0;
  const agents = await db
    .select({
      actorId: actors.entityId,
      organizationId: actors.organizationId,
      userAgentId: userAgents.id,
      disabled: sql<AgentTriggerKind[]>`coalesce((
        select array_agg(${userAgentTriggers.kind}) from ${userAgentTriggers}
        where ${userAgentTriggers.userAgentId} = ${userAgents.id} and not ${userAgentTriggers.enabled}
      ), '{}')`,
    })
    .from(messagingParticipants)
    .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
    .innerJoin(userAgents, eq(userAgents.id, actors.userAgentId))
    .where(
      and(
        eq(messagingParticipants.conversationId, message.conversationId),
        eq(messagingParticipants.actorType, "agent"),
        isNull(messagingParticipants.leftAt),
        eq(userAgents.userId, scope.userId),
        eq(actors.organizationId, scope.organizationId),
        activeActorCondition(),
      ),
    );
  if (!agents.length) return 0;
  const mentioned = new Set(
    messageReferences(message.body)
      .filter((reference) => reference.kind === "agent")
      .map((reference) => reference.id),
  );
  const worked = message.threadId
    ? new Set(
        (
          await db
            .selectDistinct({ actorId: agentRuns.agentActorEntityId })
            .from(agentRuns)
            .where(
              and(
                eq(agentRuns.conversationId, message.conversationId),
                eq(agentRuns.threadId, message.threadId),
                inArray(
                  agentRuns.agentActorEntityId,
                  agents.map((agent) => agent.actorId),
                ),
              ),
            )
        ).map((row) => row.actorId),
      )
    : new Set<string>();
  // A top-level message starts its own thread, so the reply and later turns stay together.
  const threadId = message.threadId ?? message.id;
  let queued = 0;
  for (const agent of agents) {
    let kind: AgentTriggerKind | undefined;
    if (mentioned.has(agent.actorId)) kind = "mention";
    else if (conversationKind === "dm") kind = "direct_message";
    else if (worked.has(agent.actorId)) kind = "thread_reply";
    if (!kind || agent.disabled.includes(kind)) continue;
    // Messages that arrive before the agent starts join the same queued run.
    const [run] = await db
      .insert(agentRuns)
      .values({
        organizationId: agent.organizationId,
        agentActorEntityId: agent.actorId,
        userAgentId: agent.userAgentId,
        ownerUserId: scope.userId,
        conversationId: message.conversationId,
        threadId,
        triggerKind: kind,
      })
      .onConflictDoUpdate({
        target: [agentRuns.agentActorEntityId, agentRuns.threadId],
        targetWhere: sql`${agentRuns.status} = 'queued'`,
        set: { expiresAt: sql`now() + interval '24 hours'` },
      })
      .returning({ id: agentRuns.id });
    await db
      .insert(agentRunTriggers)
      .values({
        runId: run!.id,
        conversationId: message.conversationId,
        messageId: message.id,
        kind,
      })
      .onConflictDoNothing();
    queued++;
  }
  return queued;
}
