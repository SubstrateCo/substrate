import type { RealtimeHint } from "@substrate/contracts/realtime";

import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

/** A realtime hint with the event ID that clients use to drop duplicate deliveries. */
export type RealtimeChange = RealtimeHint & { id: string };

// Realtime hints of one committed transaction, written in that transaction. The server publishes
// them after the commit and deletes the row; a relay publishes rows it left, such as after a crash
// or a Valkey outage. Rows are deleted once published, so the table stays small and needs no index.
export const realtimeOutbox = pgTable("realtime_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  changes: jsonb("changes").$type<RealtimeChange[]>().notNull(),
  attempts: integer("attempts").default(0).notNull(),
  // The server's own publish gets this long before the relay may publish the row.
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
    .default(sql`now() + interval '10 seconds'`)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
