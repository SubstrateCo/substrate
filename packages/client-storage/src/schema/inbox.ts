import type {
  InboxLane,
  InboxSource,
  InboxSourceRef,
  InboxStatus,
} from "@substrate/contracts/agent-work";

import { sessions } from "./sessions.ts";
import {
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** Anything that may start or steer a turn. Times are epoch ms. */
export const inbox = sqliteTable(
  "inbox",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    sessionId: text("session_id").notNull(),
    userAgentId: text("user_agent_id").notNull(),
    source: text("source").$type<InboxSource>().notNull(),
    sourceRef: text("source_ref", { mode: "json" }).$type<InboxSourceRef>().notNull(),
    /** Text the runtime already holds, such as a routine prompt or a helper report. */
    body: text("body"),
    wakeId: text("wake_id"),
    lane: text("lane").$type<InboxLane>().notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    availableAt: integer("available_at").notNull(),
    /** The latest available_at that debouncing may push this item to. */
    deadlineAt: integer("deadline_at").notNull(),
    status: text("status").$type<InboxStatus>().notNull().default("pending"),
    /** An owner item waiting for a busy slot. */
    held: integer("held", { mode: "boolean" }).notNull().default(false),
    /** Sent into a live turn with steer, not as the turn's first input. */
    steered: integer("steered", { mode: "boolean" }).notNull().default(false),
    reason: text("reason"),
    turnId: text("turn_id"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.sessionId],
      foreignColumns: [sessions.organizationId, sessions.id],
    }),
    uniqueIndex("inbox_agent_dedupe").on(table.userAgentId, table.dedupeKey),
    index("inbox_session_status").on(table.sessionId, table.status),
    index("inbox_organization_status").on(table.organizationId, table.status),
    index("inbox_turn").on(table.turnId),
  ],
);
