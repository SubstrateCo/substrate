import type {
  TurnAttentionReason,
  TurnEventKind,
  TurnOutcome,
  TurnSourceMessage,
  TurnStatus,
} from "@startup-os/contracts/agent-work";
import type { TurnKind, Usage } from "@startup-os/contracts/harness";

import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Who ended a live turn early. app: the desktop closed while it ran. retire: the desktop
 * switched organization or account. moved: the agent moved to another desktop.
 */
export type TurnInterruption = "owner" | "stop" | "app" | "budget" | "retire" | "moved";

/** One execution of a batch of inbox items in one session. Times are epoch ms. */
export const turns = sqliteTable(
  "turns",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    userAgentId: text("user_agent_id").notNull(),
    organizationId: text("organization_id").notNull(),
    /** One live turn per folder: main:<userAgentId> or helper:<helperId>. */
    folderKey: text("folder_key").notNull(),
    kind: text("kind").$type<TurnKind>().notNull(),
    status: text("status").$type<TurnStatus>().notNull(),
    outcome: text("outcome").$type<TurnOutcome>(),
    attempt: integer("attempt").notNull().default(1),
    generation: integer("generation").notNull().default(1),
    epoch: integer("epoch").notNull(),
    /** The epoch handoff turn of its session. */
    handoff: integer("handoff", { mode: "boolean" }).notNull().default(false),
    envelope: text("envelope"),
    prefixHash: text("prefix_hash"),
    usage: text("usage", { mode: "json" }).$type<Usage>(),
    /** The last event seq. Events are numbered without gaps. */
    eventCount: integer("event_count").notNull().default(0),
    activity: text("activity"),
    error: text("error"),
    attentionReason: text("attention_reason").$type<TurnAttentionReason>(),
    interruption: text("interruption").$type<TurnInterruption>(),
    /** Automatic continues after an app restart. The runtime continues at most once. */
    recoveries: integer("recoveries").notNull().default(0),
    /** False once the turn was told to wrap up, so it never continues by itself. */
    autoContinue: integer("auto_continue", { mode: "boolean" }).notNull().default(true),
    resumesTurnId: text("resumes_turn_id"),
    sourceMessages: text("source_messages", { mode: "json" })
      .$type<TurnSourceMessage[]>()
      .notNull()
      .default([]),
    requestAnchors: text("request_anchors", { mode: "json" })
      .$type<{ requestId: string; anchorMessageId: string | null }[]>()
      .notNull()
      .default([]),
    createdAt: integer("created_at").notNull(),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
  },
  (table) => [
    index("turns_session").on(table.sessionId, table.createdAt),
    index("turns_status").on(table.status),
  ],
);

export const turnEvents = sqliteTable(
  "turn_events",
  {
    turnId: text("turn_id").notNull(),
    seq: integer("seq").notNull(),
    attempt: integer("attempt").notNull(),
    kind: text("kind").$type<TurnEventKind>().notNull(),
    itemId: text("item_id"),
    data: text("data", { mode: "json" }).$type<unknown>().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.turnId, table.seq] })],
);

export type OutputTargetKind = "message" | "task" | "request";

/** Records a turn published or created. Placement uses the latest message. */
export const outputs = sqliteTable(
  "outputs",
  {
    turnId: text("turn_id").notNull(),
    targetKind: text("target_kind").$type<OutputTargetKind>().notNull(),
    targetId: text("target_id").notNull(),
    /** For message outputs. */
    conversationId: text("conversation_id"),
    threadId: text("thread_id"),
    /** For request outputs: question or proposal. */
    requestKind: text("request_kind").$type<"question" | "proposal">(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.turnId, table.targetKind, table.targetId] })],
);
