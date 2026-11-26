import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Scheduled unattended work. Times are epoch ms. */
export const routines = sqliteTable(
  "routines",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    userAgentId: text("user_agent_id").notNull(),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    cron: text("cron").notNull(),
    timezone: text("timezone").notNull(),
    revision: integer("revision").notNull().default(1),
    destinationConversationId: text("destination_conversation_id").notNull(),
    destinationThreadId: text("destination_thread_id"),
    catchUp: text("catch_up").$type<"latest">().notNull().default("latest"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    nextFireAt: integer("next_fire_at"),
    lastFiredAt: integer("last_fired_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("routines_due").on(table.enabled, table.nextFireAt)],
);
