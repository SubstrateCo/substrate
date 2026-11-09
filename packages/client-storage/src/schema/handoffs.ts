import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** What an epoch handed to the next one. Times are epoch ms. */
export const handoffs = sqliteTable(
  "handoffs",
  {
    sessionId: text("session_id").notNull(),
    epoch: integer("epoch").notNull(),
    objectives: text("objectives").notNull(),
    openWork: text("open_work").notNull(),
    references: text("references", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.epoch] })],
);
