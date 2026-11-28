import {
  agentStatusState,
  liveTurnStatuses,
  type AgentStatusView,
  type AgentWorkPlace,
} from "@substrate/contracts/agent-work";

import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { deviceOnline } from "../../core/devices/repository";
import { desktopDevices } from "../../core/devices/schema";
import type { DatabaseExecutor } from "../../core/executor";
import type { SessionIdentity } from "../../core/session/identity";
import { visibleConversations } from "../messaging/access";
import { messagingConversations } from "../messaging/schema";
import { claimableStatuses, startingSources } from "./items";
import { answerableBy } from "./requests/request-views";
import { agentRequests } from "./requests/requests.schema";
import { agentSessions } from "./sessions.schema";
import { agentTurns } from "./turns.schema";
import { agentWorkItems } from "./work-items.schema";
import { and, asc, desc, eq, inArray, isNull, max, sql, type SQL } from "drizzle-orm";

type Counts = Map<string, number>;

async function countBy(
  db: DatabaseExecutor,
  table: typeof agentTurns | typeof agentWorkItems | typeof agentRequests,
  where: SQL | undefined,
): Promise<Counts> {
  const rows = await db
    .select({ userAgentId: table.userAgentId, count: sql<number>`count(*)`.mapWith(Number) })
    .from(table)
    .where(where)
    .groupBy(table.userAgentId);
  return new Map(rows.map((row) => [row.userAgentId, row.count]));
}

export function workPlace(
  session: Pick<
    typeof agentSessions.$inferSelect,
    "originConversationId" | "originThreadId" | "destinationConversationId" | "destinationThreadId"
  >,
  kind: "interactive" | "unattended",
  visible: ReadonlySet<string>,
): AgentWorkPlace {
  const destination = session.destinationConversationId
    ? { conversationId: session.destinationConversationId, threadId: session.destinationThreadId }
    : null;
  const origin = session.originConversationId
    ? { conversationId: session.originConversationId, threadId: session.originThreadId }
    : null;
  const place = kind === "unattended" && destination ? destination : (origin ?? destination);
  return place && visible.has(place.conversationId) ? place : null;
}

export async function visibleAmong(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  conversationIds: (string | null)[],
) {
  const ids = [...new Set(conversationIds.filter((id): id is string => id !== null))];
  if (!ids.length) return new Set<string>();
  const rows = await db
    .select({ id: messagingConversations.id })
    .from(messagingConversations)
    .where(and(inArray(messagingConversations.id, ids), visibleConversations(db, identity)));
  return new Set(rows.map((row) => row.id));
}

export async function statusViews(
  db: DatabaseExecutor,
  identity: SessionIdentity,
): Promise<AgentStatusView[]> {
  const agents = await db
    .select({
      userAgentId: userAgents.id,
      agent: { actorId: actors.entityId, name: userAgents.name },
      device: { id: desktopDevices.id, name: desktopDevices.name, online: deviceOnline },
    })
    .from(userAgents)
    .innerJoin(
      actors,
      and(
        eq(actors.userAgentId, userAgents.id),
        eq(actors.organizationId, identity.organizationId),
      ),
    )
    .leftJoin(desktopDevices, eq(desktopDevices.id, userAgents.homeDeviceId))
    .where(and(eq(userAgents.userId, identity.userId), isNull(userAgents.deletedAt)))
    .orderBy(asc(userAgents.name), asc(userAgents.id));
  if (!agents.length) return [];
  const ids = agents.map((agent) => agent.userAgentId);
  const owned = <T extends typeof agentTurns | typeof agentWorkItems | typeof agentRequests>(
    table: T,
  ) =>
    and(
      eq(table.ownerUserId, identity.userId),
      eq(table.organizationId, identity.organizationId),
      inArray(table.userAgentId, ids),
    );
  const [requests, attention, queued] = await Promise.all([
    countBy(db, agentRequests, and(owned(agentRequests), answerableBy("answer"))),
    countBy(db, agentTurns, and(owned(agentTurns), eq(agentTurns.status, "needs_attention"))),
    countBy(
      db,
      agentWorkItems,
      and(
        owned(agentWorkItems),
        inArray(agentWorkItems.status, claimableStatuses),
        inArray(agentWorkItems.source, startingSources),
      ),
    ),
  ]);
  const live = await db
    .select({ turn: agentTurns, session: agentSessions })
    .from(agentTurns)
    .innerJoin(agentSessions, eq(agentSessions.id, agentTurns.sessionId))
    .where(and(owned(agentTurns), inArray(agentTurns.status, [...liveTurnStatuses])))
    .orderBy(desc(agentTurns.createdAt));
  const updated = await db
    .select({ userAgentId: agentSessions.userAgentId, at: max(agentSessions.updatedAt) })
    .from(agentSessions)
    .where(
      and(
        eq(agentSessions.ownerUserId, identity.userId),
        eq(agentSessions.organizationId, identity.organizationId),
        inArray(agentSessions.userAgentId, ids),
      ),
    )
    .groupBy(agentSessions.userAgentId);
  const visible = await visibleAmong(
    db,
    identity,
    live.flatMap(({ session }) => [
      session.originConversationId,
      session.destinationConversationId,
    ]),
  );
  const now = new Date().toISOString();
  return agents.map(({ userAgentId, agent, device }) => {
    const turns = live.filter(({ turn }) => turn.userAgentId === userAgentId);
    const current = turns.at(0);
    const place = current ? workPlace(current.session, current.turn.kind, visible) : null;
    const hasPlace = Boolean(
      current?.session.originConversationId ?? current?.session.destinationConversationId,
    );
    return {
      userAgentId,
      agent,
      state: agentStatusState({
        openRequests: requests.get(userAgentId) ?? 0,
        needsAttentionTurns: attention.get(userAgentId) ?? 0,
        liveTurns: turns.length,
        pendingItems: queued.get(userAgentId) ?? 0,
      }),
      queuedCount: queued.get(userAgentId) ?? 0,
      liveConversationId: place?.conversationId ?? null,
      liveThreadId: place?.threadId ?? null,
      activity: current && (place || !hasPlace) ? current.turn.activity : null,
      updatedAt: updated.find((row) => row.userAgentId === userAgentId)?.at?.toISOString() ?? now,
      device: device?.id ? device : null,
    };
  });
}
