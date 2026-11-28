import { mcpTools, taskResult, type ToolDefinition } from "@substrate/contracts/agent-tools/tools";
import type {
  AgentActivityView,
  AgentConversationWorkView,
  AgentWorkHelperView,
  AgentWorkItemView,
  AgentWorkSessionView,
  AgentWorkTurnView,
  TurnOutputView,
} from "@substrate/contracts/agent-work";

import { userAgents } from "../../../core/actors/user-agents.schema";
import { entities } from "../../../core/entities/schema";
import type { DatabaseExecutor } from "../../../core/executor";
import type { RepositoryContext } from "../../../core/repository-context";
import type { SessionIdentity } from "../../../core/session/identity";
import { AccessDeniedError, ValidationError } from "../../../errors";
import { agentToolRequests } from "../../mcp/schema";
import { messagingMessages } from "../../messaging/schema";
import type { HelperRow } from "../helpers";
import { agentHelpers } from "../helpers.schema";
import type { TurnRow } from "../host/held-turn";
import { openStatuses, type ItemRow } from "../items";
import { queryConversationRequests } from "../requests/request-views";
import { agentRequests } from "../requests/requests.schema";
import type { SessionRow } from "../sessions";
import { agentSessions } from "../sessions.schema";
import { visibleAmong } from "../status";
import { agentTurns } from "../turns.schema";
import { agentWorkItems } from "../work-items.schema";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

export const activityPageSize = 30;
const conversationTurnLimit = 50;

const iso = (value: Date | null) => value?.toISOString() ?? null;
const place = (conversationId: string | null, threadId: string | null) =>
  conversationId ? { conversationId, threadId } : null;

export const ownedBy = (
  table: typeof agentSessions | typeof agentTurns | typeof agentWorkItems | typeof agentHelpers,
  identity: SessionIdentity,
) => and(eq(table.ownerUserId, identity.userId), eq(table.organizationId, identity.organizationId));

function placeConversation(session: SessionRow) {
  return session.kind === "routine"
    ? session.destinationConversationId
    : (session.originConversationId ?? session.destinationConversationId);
}

async function sessionVisibility(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  sessions: SessionRow[],
) {
  const known = new Map(sessions.map((session) => [session.id, session]));
  const missing = [...new Set(sessions.flatMap((session) => session.parentSessionId ?? []))].filter(
    (id) => !known.has(id),
  );
  if (missing.length)
    for (const parent of await db
      .select()
      .from(agentSessions)
      .where(inArray(agentSessions.id, missing)))
      known.set(parent.id, parent);
  const effective = (session: SessionRow) =>
    session.kind === "helper" && session.parentSessionId
      ? (known.get(session.parentSessionId) ?? session)
      : session;
  const visible = await visibleAmong(db, identity, [...known.values()].map(placeConversation));
  return (session: SessionRow) => {
    const conversationId = placeConversation(effective(session));
    return conversationId === null || visible.has(conversationId);
  };
}

function sessionView(session: SessionRow, visible: boolean): AgentWorkSessionView {
  return {
    id: session.id,
    userAgentId: session.userAgentId,
    key: visible ? session.key : null,
    kind: session.kind,
    parentSessionId: session.parentSessionId,
    origin: visible ? place(session.originConversationId, session.originThreadId) : null,
    destination: visible
      ? place(session.destinationConversationId, session.destinationThreadId)
      : null,
    status: session.status,
    resetGeneration: session.resetGeneration,
    resetReason: session.resetReason,
    placeVisible: visible,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

function itemView(item: ItemRow, visible: boolean): AgentWorkItemView {
  return {
    id: item.id,
    sessionId: item.sessionId,
    turnId: item.turnId,
    source: item.source,
    sourceRef: visible ? item.sourceRef : null,
    lane: item.lane,
    status: item.status,
    held: item.held,
    steered: item.steered,
    reason: item.reason,
    availableAt: item.availableAt.toISOString(),
    createdAt: item.createdAt.toISOString(),
  };
}

function helperView(helper: HelperRow, visible: boolean): AgentWorkHelperView {
  return {
    id: helper.id,
    parentSessionId: helper.parentSessionId,
    sessionId: helper.sessionId,
    userAgentId: helper.userAgentId,
    task: visible ? helper.task : null,
    report: visible ? helper.report : null,
    status: helper.status,
    createdAt: helper.createdAt.toISOString(),
    finishedAt: iso(helper.finishedAt),
  };
}

const taskTools = Object.entries(mcpTools).flatMap(([name, tool]: [string, ToolDefinition]) =>
  tool.publishes?.some((output) => output.kind === "task") ? [name] : [],
);
const publishedTask = taskResult.pick({ id: true });

async function turnOutputs(ctx: RepositoryContext, identity: SessionIdentity, turnIds: string[]) {
  const { db } = ctx;
  const outputs = new Map<string, TurnOutputView[]>(turnIds.map((id) => [id, []]));
  if (!turnIds.length) return outputs;
  const [messages, requests, calls] = await Promise.all([
    db
      .select({
        id: messagingMessages.id,
        turnId: messagingMessages.originTurnId,
        conversationId: messagingMessages.conversationId,
        threadId: messagingMessages.threadId,
        createdAt: messagingMessages.createdAt,
      })
      .from(messagingMessages)
      .where(
        and(inArray(messagingMessages.originTurnId, turnIds), isNull(messagingMessages.deletedAt)),
      ),
    db
      .select({
        id: agentRequests.id,
        turnId: agentRequests.turnId,
        conversationId: agentRequests.conversationId,
        createdAt: agentRequests.createdAt,
      })
      .from(agentRequests)
      .where(
        and(
          inArray(agentRequests.turnId, turnIds),
          eq(agentRequests.ownerUserId, identity.userId),
          eq(agentRequests.organizationId, identity.organizationId),
        ),
      ),
    db
      .select({
        turnId: agentToolRequests.turnId,
        tool: agentToolRequests.tool,
        result: agentToolRequests.result,
      })
      .from(agentToolRequests)
      .where(
        and(
          inArray(agentToolRequests.turnId, turnIds),
          eq(agentToolRequests.organizationId, identity.organizationId),
          inArray(agentToolRequests.tool, taskTools),
        ),
      ),
  ]);
  const visible = await visibleAmong(db, identity, [
    ...messages.map((row) => row.conversationId),
    ...requests.map((row) => row.conversationId),
  ]);
  const found: (TurnOutputView & { turnId: string })[] = [];
  for (const row of messages)
    if (row.turnId && visible.has(row.conversationId))
      found.push({
        kind: "message",
        turnId: row.turnId,
        id: row.id,
        conversationId: row.conversationId,
        threadId: row.threadId,
        createdAt: row.createdAt.toISOString(),
      });
  for (const row of requests)
    if (row.turnId && (row.conversationId === null || visible.has(row.conversationId)))
      found.push({
        kind: "request",
        turnId: row.turnId,
        id: row.id,
        createdAt: row.createdAt.toISOString(),
      });
  const taskIds = new Map<string, Set<string>>();
  for (const call of calls) {
    const task = publishedTask.safeParse(call.result);
    if (!task.success || !call.turnId) continue;
    const turns = taskIds.get(task.data.id) ?? new Set();
    taskIds.set(task.data.id, turns.add(call.turnId));
  }
  if (taskIds.size) {
    const readable = await db
      .select({ id: entities.entityId, createdAt: entities.createdAt })
      .from(entities)
      .where(
        and(
          eq(entities.organizationId, identity.organizationId),
          inArray(entities.entityId, [...taskIds.keys()]),
          ctx.readable(entities.entityId, "view", "task"),
        ),
      );
    for (const task of readable)
      for (const turnId of taskIds.get(task.id) ?? [])
        found.push({ kind: "task", turnId, id: task.id, createdAt: task.createdAt.toISOString() });
  }
  found.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const { turnId, ...output } of found) outputs.get(turnId)?.push(output);
  return outputs;
}

async function turnViews(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  turns: TurnRow[],
  sessions: Map<string, SessionRow>,
  visible: (session: SessionRow) => boolean,
): Promise<AgentWorkTurnView[]> {
  if (!turns.length) return [];
  const ids = turns.map((turn) => turn.id);
  const items = await ctx.db
    .select({ id: agentWorkItems.id, turnId: agentWorkItems.turnId })
    .from(agentWorkItems)
    .where(inArray(agentWorkItems.turnId, ids))
    .orderBy(asc(agentWorkItems.createdAt), asc(agentWorkItems.id));
  const outputs = await turnOutputs(ctx, identity, ids);
  return turns.map((turn) => {
    const session = sessions.get(turn.sessionId)!;
    const shown = visible(session);
    return {
      id: turn.id,
      sessionId: turn.sessionId,
      userAgentId: turn.userAgentId,
      sessionKind: session.kind,
      kind: turn.kind,
      status: turn.status,
      outcome: turn.outcome,
      attempt: turn.attempt,
      generation: turn.generation,
      handoff: turn.handoff,
      itemIds: items.filter((item) => item.turnId === turn.id).map((item) => item.id),
      outputs: outputs.get(turn.id) ?? [],
      sourceMessages: shown ? turn.sourceMessages : [],
      requestAnchors: shown ? turn.requestAnchors : [],
      resumesTurnId: turn.resumesTurnId,
      activity: shown ? turn.activity : null,
      error: shown ? turn.error : null,
      attentionReason: turn.attentionReason,
      interruption: turn.interruption,
      usage: turn.usage,
      placeVisible: shown,
      createdAt: turn.createdAt.toISOString(),
      startedAt: iso(turn.startedAt),
      finishedAt: iso(turn.finishedAt),
    };
  });
}

async function sessionsOf(db: DatabaseExecutor, ids: string[], known: SessionRow[] = []) {
  const sessions = new Map(known.map((session) => [session.id, session]));
  const missing = [...new Set(ids)].filter((id) => !sessions.has(id));
  if (missing.length)
    for (const row of await db
      .select()
      .from(agentSessions)
      .where(inArray(agentSessions.id, missing)))
      sessions.set(row.id, row);
  return sessions;
}

export async function requireOwnedAgent(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  userAgentId: string,
) {
  const [agent] = await db
    .select()
    .from(userAgents)
    .where(
      and(
        eq(userAgents.id, userAgentId),
        eq(userAgents.userId, identity.userId),
        isNull(userAgents.deletedAt),
      ),
    );
  if (!agent) throw new AccessDeniedError();
  return agent;
}

function parseCursor(cursor: string) {
  const split = cursor.indexOf(":");
  const createdAt = Number(cursor.slice(0, split));
  const id = cursor.slice(split + 1);
  if (split < 1 || !Number.isSafeInteger(createdAt) || !/^[0-9a-f-]{36}$/i.test(id))
    throw new ValidationError("Invalid cursor.");
  return { createdAt: new Date(createdAt), id };
}

export async function agentActivity(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  userAgentId: string,
  cursor?: string,
): Promise<AgentActivityView> {
  const { db } = ctx;
  await requireOwnedAgent(db, identity, userAgentId);
  const before = cursor === undefined ? undefined : parseCursor(cursor);
  const rows = await db
    .select()
    .from(agentTurns)
    .where(
      and(
        ownedBy(agentTurns, identity),
        eq(agentTurns.userAgentId, userAgentId),
        before &&
          sql`(${agentTurns.createdAt}, ${agentTurns.id}) < (${before.createdAt.toISOString()}::timestamptz, ${before.id}::uuid)`,
      ),
    )
    .orderBy(desc(agentTurns.createdAt), desc(agentTurns.id))
    .limit(activityPageSize + 1);
  const page = rows.slice(0, activityPageSize);
  const last = page.at(-1);
  const nextCursor =
    rows.length > activityPageSize && last ? `${last.createdAt.getTime()}:${last.id}` : null;
  const [ownSessions, helpers] = before
    ? [[], []]
    : await Promise.all([
        db
          .select()
          .from(agentSessions)
          .where(and(ownedBy(agentSessions, identity), eq(agentSessions.userAgentId, userAgentId)))
          .orderBy(desc(agentSessions.updatedAt), desc(agentSessions.id))
          .limit(200),
        db
          .select()
          .from(agentHelpers)
          .where(and(ownedBy(agentHelpers, identity), eq(agentHelpers.userAgentId, userAgentId)))
          .orderBy(desc(agentHelpers.createdAt), desc(agentHelpers.id))
          .limit(100),
      ]);
  const sessions = await sessionsOf(
    db,
    [...page.map((turn) => turn.sessionId), ...helpers.map((helper) => helper.parentSessionId)],
    ownSessions,
  );
  const visible = await sessionVisibility(db, identity, [...sessions.values()]);
  return {
    sessions: ownSessions.map((session) => sessionView(session, visible(session))),
    helpers: helpers.map((helper) => {
      const parent = sessions.get(helper.parentSessionId);
      return helperView(helper, parent ? visible(parent) : false);
    }),
    turns: await turnViews(ctx, identity, page, sessions, visible),
    nextCursor,
  };
}

export async function conversationWork(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  conversationId: string,
): Promise<AgentConversationWorkView> {
  const { db } = ctx;
  if (!(await visibleAmong(db, identity, [conversationId])).size) throw new AccessDeniedError();
  const rows = await db
    .select()
    .from(agentSessions)
    .where(
      and(
        ownedBy(agentSessions, identity),
        or(
          eq(agentSessions.originConversationId, conversationId),
          eq(agentSessions.destinationConversationId, conversationId),
        ),
      ),
    )
    .orderBy(desc(agentSessions.updatedAt), desc(agentSessions.id));
  const ids = rows.map((session) => session.id);
  const requests = await queryConversationRequests(db, identity, conversationId);
  if (!ids.length) return { conversationId, sessions: [], turns: [], items: [], requests };
  const items = await db
    .select()
    .from(agentWorkItems)
    .where(
      and(inArray(agentWorkItems.sessionId, ids), inArray(agentWorkItems.status, openStatuses)),
    )
    .orderBy(asc(agentWorkItems.createdAt), asc(agentWorkItems.id));
  const turns = await db
    .select()
    .from(agentTurns)
    .where(inArray(agentTurns.sessionId, ids))
    .orderBy(desc(agentTurns.createdAt), desc(agentTurns.id))
    .limit(conversationTurnLimit);
  const sessions = new Map(rows.map((session) => [session.id, session]));
  const visible = await sessionVisibility(db, identity, rows);
  return {
    conversationId,
    sessions: rows.map((session) => sessionView(session, visible(session))),
    turns: await turnViews(ctx, identity, turns, sessions, visible),
    items: items.map((item) => itemView(item, visible(sessions.get(item.sessionId)!))),
    requests,
  };
}

export async function ownerTurn(ctx: RepositoryContext, identity: SessionIdentity, turnId: string) {
  const [turn] = await ctx.db
    .select()
    .from(agentTurns)
    .where(and(eq(agentTurns.id, turnId), ownedBy(agentTurns, identity)));
  if (!turn) throw new AccessDeniedError();
  const sessions = await sessionsOf(ctx.db, [turn.sessionId]);
  const visible = await sessionVisibility(ctx.db, identity, [...sessions.values()]);
  const [view] = await turnViews(ctx, identity, [turn], sessions, visible);
  return view!;
}

export async function ownerItem(db: DatabaseExecutor, identity: SessionIdentity, item: ItemRow) {
  const sessions = await sessionsOf(db, [item.sessionId]);
  const visible = await sessionVisibility(db, identity, [...sessions.values()]);
  return itemView(item, visible(sessions.get(item.sessionId)!));
}
