import type { TurnEventKind } from "@substrate/contracts/agent-work";

import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * One attempt of a server turn that this host ran: what it sent the harness. The server owns
 * the turn's lifecycle. Times are epoch ms.
 */
export const turnRuns = sqliteTable(
  "turn_runs",
  {
    organizationId: text("organization_id").notNull(),
    /** The server turn ID. */
    turnId: text("turn_id").notNull(),
    attempt: integer("attempt").notNull(),
    /** The server session ID. */
    sessionId: text("session_id").notNull(),
    userAgentId: text("user_agent_id").notNull(),
    epoch: integer("epoch").notNull(),
    envelope: text("envelope").notNull(),
    prefixHash: text("prefix_hash").notNull(),
    /** Events recorded in this attempt. */
    eventCount: integer("event_count").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.turnId, table.attempt] }),
    // The latest turn of a session, for native output between turns.
    index("turn_runs_session").on(table.organizationId, table.sessionId, table.createdAt),
  ],
);

/** The transcript of a server turn, numbered without gaps across its attempts. */
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
