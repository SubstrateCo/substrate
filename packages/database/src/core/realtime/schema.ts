import type { RealtimeAudience, RealtimeDomain } from "@startup-os/contracts/realtime";

import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const realtimeOutbox = pgTable(
  "realtime_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    audience: jsonb("audience").$type<Readonly<RealtimeAudience>>().notNull(),
    domain: text("domain").$type<RealtimeDomain>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("realtime_outbox_order_idx").on(table.createdAt, table.id)],
);
