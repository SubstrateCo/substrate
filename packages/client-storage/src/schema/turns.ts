import type { TurnEventKind } from "@substrate/contracts/agent-work";

import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const turnRuns = sqliteTable(
  "turn_runs",
  {
    organizationId: text("organization_id").notNull(),
    turnId: text("turn_id").notNull(),
    attempt: integer("attempt").notNull(),
    sessionId: text("session_id").notNull(),
    userAgentId: text("user_agent_id").notNull(),
    epoch: integer("epoch").notNull(),
    envelope: text("envelope").notNull(),
    prefixHash: text("prefix_hash").notNull(),
    eventCount: integer("event_count").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.turnId, table.attempt] }),
    index("turn_runs_session").on(table.organizationId, table.sessionId, table.createdAt),
  ],
);

export const turnEvents = sqliteTable(
  "turn_events",
  {
    organizationId: text("organization_id").notNull(),
    turnId: text("turn_id").notNull(),
    seq: integer("seq").notNull(),
    attempt: integer("attempt").notNull(),
    kind: text("kind").$type<TurnEventKind>().notNull(),
    itemId: text("item_id"),
    data: text("data", { mode: "json" }).$type<unknown>().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.turnId, table.seq] })],
);
