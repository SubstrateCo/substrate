import type { AgentWakeRequestDetail } from "@substrate/contracts/agent-work";
import type { HostItem, HostTurn } from "@substrate/contracts/agent-work/control";

import type { DatabaseExecutor } from "../../../core/executor";
import type { ItemRow } from "../items";
import { agentRequests } from "../requests/requests.schema";
import { helperIdOf, type SessionRow } from "../sessions";
import { agentSessions } from "../sessions.schema";
import { agentTurns } from "../turns.schema";
import { agentWorkItems } from "../work-items.schema";
import type { TurnRow } from "./held-turn";
import { and, asc, eq, inArray } from "drizzle-orm";

const iso = (value: Date | null) => value?.toISOString() ?? null;
const place = (conversationId: string | null, threadId: string | null) =>
  conversationId ? { conversationId, threadId } : null;

function requestDetail(request: typeof agentRequests.$inferSelect): AgentWakeRequestDetail {
  return {
    id: request.id,
    kind: request.kind,
    status: request.status,
    payload: request.payload,
    response: request.response ?? null,
    outcome: request.outcome ?? null,
    anchorMessageId: request.anchorMessageId,
    conversationId: request.conversationId,
    threadId: request.threadId,
  };
}

async function requestsOf(db: DatabaseExecutor, items: ItemRow[]) {
  const ids = items.flatMap((item) =>
    item.sourceRef.source === "answer" || item.sourceRef.source === "approval_result"
      ? [item.sourceRef.requestId]
      : [],
  );
  if (!ids.length) return new Map<string, typeof agentRequests.$inferSelect>();
  const rows = await db.select().from(agentRequests).where(inArray(agentRequests.id, ids));
  return new Map(rows.map((row) => [row.id, row]));
}

export async function hostItems(db: DatabaseExecutor, items: ItemRow[]): Promise<HostItem[]> {
  const requests = await requestsOf(db, items);
  return items.map((item) => {
    const ref = item.sourceRef;
    const request =
      ref.source === "answer" || ref.source === "approval_result"
        ? requests.get(ref.requestId)
        : undefined;
    return {
      id: item.id,
      sessionId: item.sessionId,
      source: item.source,
      sourceRef: item.sourceRef,
      body: item.body,
      lane: item.lane,
      status: item.status,
      steered: item.steered,
      request: request && request.userAgentId === item.userAgentId ? requestDetail(request) : null,
      createdAt: item.createdAt.toISOString(),
    };
  });
}

function hostSession(session: SessionRow): HostTurn["session"] {
  return {
    id: session.id,
    userAgentId: session.userAgentId,
    key: session.key,
    kind: session.kind,
    status: session.status,
    parentSessionId: session.parentSessionId,
    helperId: helperIdOf(session),
    origin: place(session.originConversationId, session.originThreadId),
    destination: place(session.destinationConversationId, session.destinationThreadId),
    resetGeneration: session.resetGeneration,
    resetReason: session.resetReason,
  };
}

function hostTurnSummary(turn: TurnRow): HostTurn["turn"] {
  return {
    id: turn.id,
    userAgentId: turn.userAgentId,
    sessionId: turn.sessionId,
    folderKey: turn.folderKey,
    kind: turn.kind,
    status: turn.status,
    attempt: turn.attempt,
    generation: turn.generation,
    handoff: turn.handoff,
    interruption: turn.interruption,
    recoveries: turn.recoveries,
    autoContinue: turn.autoContinue,
    resumesTurnId: turn.resumesTurnId,
    leaseExpiresAt: iso(turn.leaseExpiresAt),
    createdAt: turn.createdAt.toISOString(),
    startedAt: iso(turn.startedAt),
  };
}

export async function hostTurns(db: DatabaseExecutor, turnIds: string[]): Promise<HostTurn[]> {
  if (!turnIds.length) return [];
  const rows = await db
    .select({ turn: agentTurns, session: agentSessions })
    .from(agentTurns)
    .innerJoin(agentSessions, eq(agentSessions.id, agentTurns.sessionId))
    .where(inArray(agentTurns.id, turnIds))
    .orderBy(asc(agentTurns.createdAt), asc(agentTurns.id));
  const items = await db
    .select()
    .from(agentWorkItems)
    .where(
      and(
        inArray(agentWorkItems.turnId, turnIds),
        inArray(agentWorkItems.status, ["submitted", "uncertain"]),
      ),
    )
    .orderBy(asc(agentWorkItems.createdAt), asc(agentWorkItems.id));
  const views = await hostItems(db, items);
  return rows.map(({ turn, session }) => ({
    turn: hostTurnSummary(turn),
    session: hostSession(session),
    items: views.filter((_, index) => items[index]!.turnId === turn.id),
  }));
}
