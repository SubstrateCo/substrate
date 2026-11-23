import type {
  AgentHelperView,
  AgentInboxItemView,
  AgentRoutineView,
  AgentSessionView,
  AgentTurnView,
  TurnOutputView,
} from "@substrate/contracts/agent-work";

import type { HelperRow } from "./helpers.ts";
import type { InboxRow } from "./inbox.ts";
import type { OutputRow } from "./outputs.ts";
import type { RoutineRow } from "./routines.ts";
import type { SessionRow, SessionSummary } from "./sessions.ts";
import type { TurnRow } from "./turns/claim.ts";

const iso = (value: number) => new Date(value).toISOString();
const isoOrNull = (value: number | null) => (value === null ? null : iso(value));

export function sessionView(row: SessionSummary): AgentSessionView {
  return {
    id: row.id,
    userAgentId: row.userAgentId,
    key: row.key,
    kind: row.kind,
    parentSessionId: row.parentSessionId,
    origin: row.originConversationId
      ? { conversationId: row.originConversationId, threadId: row.originThreadId }
      : null,
    destination: row.destinationConversationId
      ? { conversationId: row.destinationConversationId, threadId: row.destinationThreadId }
      : null,
    harness: row.harness,
    epoch: row.epoch,
    status: row.status,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function itemView(row: InboxRow): AgentInboxItemView {
  return {
    id: row.id,
    sessionId: row.sessionId,
    source: row.source,
    sourceRef: row.sourceRef,
    lane: row.lane,
    status: row.status,
    held: row.held,
    reason: row.reason,
    turnId: row.turnId,
    availableAt: iso(row.availableAt),
    createdAt: iso(row.createdAt),
  };
}

function outputView(row: OutputRow): TurnOutputView {
  const createdAt = iso(row.createdAt);
  if (row.targetKind === "message")
    return {
      kind: "message",
      id: row.targetId,
      conversationId: row.conversationId!,
      threadId: row.threadId,
      createdAt,
    };
  return { kind: row.targetKind, id: row.targetId, createdAt };
}

export function turnView(
  row: TurnRow,
  context: { session: Pick<SessionRow, "kind">; items: InboxRow[]; outputs: OutputRow[] },
): AgentTurnView {
  return {
    id: row.id,
    sessionId: row.sessionId,
    userAgentId: row.userAgentId,
    sessionKind: context.session.kind,
    kind: row.kind,
    status: row.status,
    outcome: row.outcome,
    attempt: row.attempt,
    generation: row.generation,
    itemIds: context.items.map((item) => item.id),
    outputs: context.outputs.map(outputView),
    sourceMessages: row.sourceMessages,
    requestAnchors: row.requestAnchors,
    resumesTurnId: row.resumesTurnId,
    activity: row.activity,
    error: row.error,
    attentionReason: row.attentionReason,
    usage: row.usage,
    eventCount: row.eventCount,
    createdAt: iso(row.createdAt),
    startedAt: isoOrNull(row.startedAt),
    finishedAt: isoOrNull(row.finishedAt),
  };
}

export function helperView(row: HelperRow): AgentHelperView {
  return {
    id: row.id,
    parentSessionId: row.parentSessionId,
    sessionId: row.sessionId,
    userAgentId: row.userAgentId,
    task: row.task,
    status: row.status,
    report: row.report,
    createdAt: iso(row.createdAt),
    finishedAt: isoOrNull(row.finishedAt),
  };
}

export function routineView(row: RoutineRow): AgentRoutineView {
  return {
    id: row.id,
    userAgentId: row.userAgentId,
    name: row.name,
    prompt: row.prompt,
    cron: row.cron,
    timezone: row.timezone,
    revision: row.revision,
    approvedRevision: row.approvedRevision,
    destination: {
      conversationId: row.destinationConversationId,
      threadId: row.destinationThreadId,
    },
    catchUp: row.catchUp,
    enabled: row.enabled,
    nextFireAt: isoOrNull(row.nextFireAt),
    lastFiredAt: isoOrNull(row.lastFiredAt),
    createdAt: iso(row.createdAt),
  };
}
