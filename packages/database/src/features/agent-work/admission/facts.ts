import type { TurnPlace } from "@substrate/contracts/agent-tools";
import { liveTurnStatuses, parseSessionKey, sessionKeys } from "@substrate/contracts/agent-work";
import type { AgentTriggerKind } from "@substrate/contracts/agents";

import { actors } from "../../../core/actors/schema";
import { userAgents } from "../../../core/actors/user-agents.schema";
import type { DatabaseExecutor } from "../../../core/executor";
import { messageReferences } from "../../../core/text/references";
import { userAgentTriggers } from "../../agents/triggers.schema";
import { liveAgentMember } from "../../messaging/access";
import { messagingParticipants } from "../../messaging/schema";
import { agentSessions } from "../sessions.schema";
import { agentTurns } from "../turns.schema";
import { agentWorkItems } from "../work-items.schema";
import type { AdmissionInput, MessageTrigger, RequestTrigger, ThreadTurnFacts } from "./admission";
import { threadParticipation } from "./thread-participation";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

const passiveThread = (trigger: MessageTrigger) =>
  trigger.message.threadId !== null && trigger.conversationKind !== "dm";

/** The live turns of these agents' sessions for the thread, with their passive batch counts. */
async function threadTurns(db: DatabaseExecutor, rootId: string, userAgentIds: string[]) {
  const rows = await db
    .select({
      userAgentId: agentTurns.userAgentId,
      id: agentTurns.id,
      kind: agentTurns.kind,
      status: agentTurns.status,
      handoff: agentTurns.handoff,
      since: sql<Date>`coalesce(${agentTurns.startedAt}, ${agentTurns.createdAt})`.mapWith(
        agentTurns.createdAt,
      ),
      passiveBatches: sql<number>`(
        select count(*) from ${agentWorkItems}
        where ${agentWorkItems.turnId} = ${agentTurns.id} and ${agentWorkItems.source} = 'thread_context'
      )`.mapWith(Number),
    })
    .from(agentTurns)
    .innerJoin(agentSessions, eq(agentSessions.id, agentTurns.sessionId))
    .where(
      and(
        inArray(agentTurns.userAgentId, userAgentIds),
        eq(agentSessions.key, sessionKeys.thread(rootId)),
        inArray(agentTurns.status, [...liveTurnStatuses]),
      ),
    );
  return new Map<string, ThreadTurnFacts>(
    rows.map(({ userAgentId, ...turn }) => [userAgentId, turn]),
  );
}

/**
 * The candidate agents for a message: the author's own live agents in the conversation, and in a
 * thread outside DMs every other live agent member, whose live thread turn may take it as
 * passive context. An agent author has no own agents to start, so only thread members remain.
 */
export async function messageInputs(
  db: DatabaseExecutor,
  trigger: MessageTrigger,
): Promise<Extract<AdmissionInput, { type: "message" }>[]> {
  const { author, message } = trigger;
  const passive = passiveThread(trigger);
  if (author.kind === "agent" && !passive) return [];
  const rows = await db
    .select({
      actorId: actors.entityId,
      organizationId: actors.organizationId,
      userAgentId: userAgents.id,
      ownerUserId: userAgents.userId,
      participatedInThread: threadParticipation(db, trigger),
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
        liveAgentMember(message.conversationId),
        eq(actors.organizationId, trigger.organizationId),
        author.kind === "agent" ? ne(actors.entityId, author.actorEntityId) : undefined,
        author.kind === "human" && !passive ? eq(userAgents.userId, author.userId) : undefined,
      ),
    );
  if (!rows.length) return [];
  const turns =
    passive && message.threadId
      ? await threadTurns(
          db,
          message.threadId,
          rows.map((row) => row.userAgentId),
        )
      : new Map<string, ThreadTurnFacts>();
  const mentioned = new Set(
    messageReferences(message.body)
      .filter((reference) => reference.kind === "agent")
      .map((reference) => reference.id),
  );
  return rows.map(({ disabled, participatedInThread, ...agent }) => ({
    type: "message",
    trigger,
    facts: {
      agent,
      mentioned: mentioned.has(agent.actorId),
      participatedInThread,
      disabled,
      threadTurn: turns.get(agent.userAgentId) ?? null,
    },
  }));
}

/** Where a request's session came from: its conversation, and the thread its key names. */
export function requestPlace(trigger: RequestTrigger): TurnPlace | null {
  const { request } = trigger;
  const key = parseSessionKey(request.sessionKey);
  if (!request.conversationId || !key) return null;
  return {
    conversationId: request.conversationId,
    threadId: key.kind === "thread" ? key.id : null,
  };
}
