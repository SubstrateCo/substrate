import type {
  InboxLane,
  InboxSource,
  InboxSourceRef,
  InboxStatus,
} from "@substrate/contracts/agent-work";

import { idColumn } from "../../core/ids";
import { agentWorkColumns, agentWorkForeignKeys } from "./provenance.schema";
import { agentSessions } from "./sessions.schema";
import { agentTurns } from "./turns.schema";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Anything that may start or steer a turn: the agent's queue. It holds references, not message
// bodies: the host loads bodies through the visibility-checked sources query. Admission creates
// every item, and the trigger registry chooses its lane.
export const agentWorkItems = pgTable(
  "agent_work_items",
  {
    id: idColumn(),
    ...agentWorkColumns(),
    sessionId: uuid("session_id").notNull(),
    source: text("source").$type<InboxSource>().notNull(),
    sourceRef: jsonb("source_ref").$type<InboxSourceRef>().notNull(),
    // Only text the server owns: a routine prompt, a helper task or report, a resume note.
    body: text("body"),
    lane: text("lane").$type<InboxLane>().notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    // The latest available_at that debouncing may push this item to.
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    status: text("status").$type<InboxStatus>().notNull().default("pending"),
    // An owner item waiting for a busy slot. The owner can send it now.
    held: boolean("held").notNull().default(false),
    // Sent into a live turn with steer, not as the turn's first input.
    steered: boolean("steered").notNull().default(false),
    reason: text("reason"),
    turnId: uuid("turn_id").references(() => agentTurns.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    ...agentWorkForeignKeys(table, "agent_work_items"),
    foreignKey({
      name: "agent_work_items_session_fk",
      columns: [table.organizationId, table.userAgentId, table.sessionId],
      foreignColumns: [agentSessions.organizationId, agentSessions.userAgentId, agentSessions.id],
    }).onDelete("cascade"),
    unique("agent_work_items_dedupe_unique").on(table.userAgentId, table.dedupeKey),
    // Claimable items per agent, in wait order: claims and status counts.
    index("agent_work_items_claimable_idx")
      .on(table.userAgentId, table.availableAt)
      .where(sql`${table.status} IN ('pending', 'confirmed_unconsumed')`),
    // Open items of a session: debounce, steering, helpers and routines.
    index("agent_work_items_session_idx").on(table.sessionId, table.status),
    // A turn's items: finish, recovery and settlement.
    index("agent_work_items_turn_idx").on(table.turnId),
    check("agent_work_items_dedupe_check", sql`length(${table.dedupeKey}) BETWEEN 1 AND 300`),
    check(
      "agent_work_items_body_check",
      sql`${table.body} IS NULL OR length(${table.body}) <= 20000`,
    ),
    check("agent_work_items_deadline_check", sql`${table.availableAt} <= ${table.deadlineAt}`),
  ],
);
