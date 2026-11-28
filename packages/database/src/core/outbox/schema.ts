import type { RealtimeHint } from "@substrate/contracts/realtime";

import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

export type RealtimeChange = RealtimeHint & { id: string };

export const realtimeOutbox = pgTable("realtime_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  changes: jsonb("changes").$type<RealtimeChange[]>().notNull(),
  attempts: integer("attempts").default(0).notNull(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
    .default(sql`now() + interval '10 seconds'`)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
