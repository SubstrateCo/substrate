import { wakeDedupeKeys, type AgentWakeMessageKind } from "@substrate/contracts/agent-work";
import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import type { SessionIdentity } from "../../core/session/identity";
import { messageReferences } from "../../core/text/references";
import { userAgentTriggers } from "../agents/triggers.schema";
import { liveAgentMember } from "../messaging/access";
import { messagingMessages, messagingParticipants } from "../messaging/schema";
import { agentRequests } from "./requests.schema";
import { wakeKind, wakeSessionKey } from "./wake-kind";
import { agentWakes } from "./wakes.schema";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";

// Agents that already worked in this thread: they published a reply there or asked there.
async function agentsThatWorked(
  db: DatabaseExecutor,
  message: typeof messagingMessages.$inferSelect,
  agents: { actorId: string; userAgentId: string }[],
) {
  if (!message.threadId) return new Set<string>();
  const replied = await db
    .selectDistinct({ actorId: messagingMessages.authorActorEntityId })
    .from(messagingMessages)
    .where(
      and(
        eq(messagingMessages.conversationId, message.conversationId),
        or(
          eq(messagingMessages.id, message.threadId),
          eq(messagingMessages.threadId, message.threadId),
        ),
        isNotNull(messagingMessages.originTurnId),
        inArray(
          messagingMessages.authorActorEntityId,
          agents.map((agent) => agent.actorId),
        ),
      ),
    );
  const asked = await db
    .selectDistinct({ actorId: agentRequests.agentActorEntityId })
    .from(agentRequests)
    .where(
      and(
        eq(agentRequests.conversationId, message.conversationId),
        eq(agentRequests.threadId, message.threadId),
        inArray(
          agentRequests.userAgentId,
          agents.map((agent) => agent.userAgentId),
        ),
      ),
    );
  return new Set([...replied, ...asked].map((row) => row.actorId));
}

/**
 * Creates wakes for the author's own agents that this message addresses. Call in the transaction
 * that inserts the message, so a committed message always has its wakes. Returns realtime hints
 * to publish after commit.
 *
 * Only the agent's owner wakes it: the agent works on the owner's desktop with the owner's
 * access. Agent-written messages never wake, which also stops agent-to-agent loops. Each agent
 * gets at most one wake per message: mention, then DM, then a reply in a thread it worked in.
 */
export async function routeWake(
  db: DatabaseExecutor,
  scope: SessionIdentity,
  message: typeof messagingMessages.$inferSelect,
  conversationKind: "dm" | "group" | "channel",
): Promise<RealtimeHint[]> {
  // Without an actor in scope, the author is the session user's human actor.
  if (scope.actorEntityId) return [];
  const agents = await db
    .select({
      actorId: actors.entityId,
      organizationId: actors.organizationId,
      userAgentId: userAgents.id,
      disabled: sql<AgentWakeMessageKind[]>`coalesce((
        select array_agg(${userAgentTriggers.kind}) from ${userAgentTriggers}
        where ${userAgentTriggers.userAgentId} = ${userAgents.id} and not ${userAgentTriggers.enabled}
      ), '{}')`,
    })
    .from(messagingParticipants)
    .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
    .innerJoin(userAgents, eq(userAgents.id, actors.userAgentId))
    .where(
      and(
        liveAgentMember(message.conversationId),
        eq(userAgents.userId, scope.userId),
        eq(actors.organizationId, scope.organizationId),
      ),
    );
  if (!agents.length) return [];
  const mentioned = new Set(
    messageReferences(message.body)
      .filter((reference) => reference.kind === "agent")
      .map((reference) => reference.id),
  );
  const worked = await agentsThatWorked(db, message, agents);
  const sessionKey = wakeSessionKey(conversationKind, message);
  const wakes = agents.flatMap((agent) => {
    const kind = wakeKind({
      mentioned: mentioned.has(agent.actorId),
      directMessage: conversationKind === "dm",
      workedInThread: worked.has(agent.actorId),
      disabled: agent.disabled,
    });
    if (!kind) return [];
    return [
      {
        organizationId: agent.organizationId,
        userAgentId: agent.userAgentId,
        agentActorEntityId: agent.actorId,
        ownerUserId: scope.userId,
        source: "owner_message" as const,
        sourceRef: {
          messageId: message.id,
          conversationId: message.conversationId,
          threadId: message.threadId,
          kind,
        },
        sessionKey,
        dedupeKey: wakeDedupeKeys.message(message.id),
      },
    ];
  });
  if (!wakes.length) return [];
  const created = await db
    .insert(agentWakes)
    .values(wakes)
    .onConflictDoNothing()
    .returning({ id: agentWakes.id });
  return created.length
    ? [{ audience: realtimeKeys.user(scope.userId), domain: "agent-work" }]
    : [];
}
