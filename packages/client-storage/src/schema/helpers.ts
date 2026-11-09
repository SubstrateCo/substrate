import type { HelperStatus } from "@startup-os/contracts/agent-work";

import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** A child session in its own folder and slot. Times are epoch ms. */
export const helpers = sqliteTable(
  "helpers",
  {
    id: text("id").primaryKey(),
    parentSessionId: text("parent_session_id").notNull(),
    sessionId: text("session_id").notNull(),
    userAgentId: text("user_agent_id").notNull(),
    /** start_helper's requestId, so a repeated call returns the same helper. */
    requestId: text("request_id").notNull(),
    task: text("task").notNull(),
    status: text("status").$type<HelperStatus>().notNull().default("running"),
    report: text("report"),
    createdAt: integer("created_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (table) => [
    uniqueIndex("helpers_request").on(table.parentSessionId, table.requestId),
    index("helpers_agent_status").on(table.userAgentId, table.status),
  ],
);
