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

export const agentWorkItems = pgTable(
  "agent_work_items",
  {
    id: idColumn(),
    ...agentWorkColumns(),
    sessionId: uuid("session_id").notNull(),
    source: text("source").$type<InboxSource>().notNull(),
    sourceRef: jsonb("source_ref").$type<InboxSourceRef>().notNull(),
    body: text("body"),
    lane: text("lane").$type<InboxLane>().notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    status: text("status").$type<InboxStatus>().notNull().default("pending"),
    held: boolean("held").notNull().default(false),
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
    index("agent_work_items_claimable_idx")
      .on(table.userAgentId, table.availableAt)
      .where(sql`${table.status} IN ('pending', 'confirmed_unconsumed')`),
    index("agent_work_items_session_idx").on(table.sessionId, table.status),
    index("agent_work_items_turn_idx").on(table.turnId),
    check("agent_work_items_dedupe_check", sql`length(${table.dedupeKey}) BETWEEN 1 AND 300`),
    check(
      "agent_work_items_body_check",
      sql`${table.body} IS NULL OR length(${table.body}) <= 20000`,
    ),
    check("agent_work_items_deadline_check", sql`${table.availableAt} <= ${table.deadlineAt}`),
  ],
);
