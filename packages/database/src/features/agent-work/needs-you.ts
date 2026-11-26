import type {
  AgentAttentionTurnView,
  AgentNeedsYou,
  AgentUncertainItemView,
} from "@substrate/contracts/agent-work";

import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import type { DatabaseExecutor } from "../../core/executor";
import type { SessionIdentity } from "../../core/session/identity";
import { answerableBy, requestViews } from "./requests/request-views";
import { agentSessions } from "./sessions.schema";
import { statusViews, visibleAmong, workPlace } from "./status";
import { agentTurns } from "./turns.schema";
import { agentWorkItems } from "./work-items.schema";
import { and, desc, eq } from "drizzle-orm";

const iso = (value: Date | null) => value?.toISOString() ?? null;

/** Turns of the owner's agents that wait for the owner, newest first. */
async function attentionTurns(db: DatabaseExecutor, identity: SessionIdentity) {
  return db
    .select({
      turn: agentTurns,
      session: agentSessions,
      agent: { actorId: actors.entityId, name: userAgents.name },
    })
    .from(agentTurns)
    .innerJoin(agentSessions, eq(agentSessions.id, agentTurns.sessionId))
    .innerJoin(actors, eq(actors.entityId, agentTurns.agentActorEntityId))
    .innerJoin(userAgents, eq(userAgents.id, agentTurns.userAgentId))
    .where(
      and(
        eq(agentTurns.ownerUserId, identity.userId),
        eq(agentTurns.organizationId, identity.organizationId),
        eq(agentTurns.status, "needs_attention"),
      ),
    )
    .orderBy(desc(agentTurns.createdAt), desc(agentTurns.id))
    .limit(100);
}

/** Items of the owner's agents that the harness may or may not have read, newest first. */
async function uncertainItems(db: DatabaseExecutor, identity: SessionIdentity) {
  return db
    .select({
      item: agentWorkItems,
      session: agentSessions,
      agent: { actorId: actors.entityId, name: userAgents.name },
    })
    .from(agentWorkItems)
    .innerJoin(agentSessions, eq(agentSessions.id, agentWorkItems.sessionId))
    .innerJoin(actors, eq(actors.entityId, agentWorkItems.agentActorEntityId))
    .innerJoin(userAgents, eq(userAgents.id, agentWorkItems.userAgentId))
    .where(
      and(
        eq(agentWorkItems.ownerUserId, identity.userId),
        eq(agentWorkItems.organizationId, identity.organizationId),
        eq(agentWorkItems.status, "uncertain"),
      ),
    )
    .orderBy(desc(agentWorkItems.createdAt), desc(agentWorkItems.id))
    .limit(100);
}

/**
 * Everything that waits for the owner: open requests, agents whose status is needs_you, turns
 * that need attention, and uncertain items. A place is shown only while the owner can open it.
 */
export async function queryNeedsYou(
  db: DatabaseExecutor,
  identity: SessionIdentity,
): Promise<AgentNeedsYou> {
  const [requests, statuses, turns, items] = await Promise.all([
    requestViews(db, identity, answerableBy("answer")),
    statusViews(db, identity),
    attentionTurns(db, identity),
    uncertainItems(db, identity),
  ]);
  const visible = await visibleAmong(
    db,
    identity,
    [...turns, ...items].flatMap(({ session }) => [
      session.originConversationId,
      session.destinationConversationId,
    ]),
  );
  return {
    requests,
    agents: statuses.filter((status) => status.state === "needs_you"),
    turns: turns.map(({ turn, session, agent }): AgentAttentionTurnView => ({
      id: turn.id,
      userAgentId: turn.userAgentId,
      agent,
      sessionId: turn.sessionId,
      attentionReason: turn.attentionReason,
      place: workPlace(session, turn.kind, visible),
      createdAt: turn.createdAt.toISOString(),
      finishedAt: iso(turn.finishedAt),
    })),
    items: items.map(({ item, session, agent }): AgentUncertainItemView => ({
      id: item.id,
      userAgentId: item.userAgentId,
      agent,
      turnId: item.turnId,
      source: item.source,
      place: workPlace(session, "interactive", visible),
      createdAt: item.createdAt.toISOString(),
    })),
  };
}
