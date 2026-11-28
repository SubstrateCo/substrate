import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const handoffs = sqliteTable(
  "handoffs",
  {
    organizationId: text("organization_id").notNull(),
    sessionId: text("session_id").notNull(),
    epoch: integer("epoch").notNull(),
    objectives: text("objectives").notNull(),
    openWork: text("open_work").notNull(),
    references: text("references", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.sessionId, table.epoch] })],
);
