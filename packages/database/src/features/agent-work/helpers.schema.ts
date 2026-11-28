import type { HelperStatus } from "@substrate/contracts/agent-work";

import { idColumn } from "../../core/ids";
import { agentWorkColumns, agentWorkForeignKeys } from "./provenance.schema";
import { agentSessions } from "./sessions.schema";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const agentHelpers = pgTable(
  "agent_helpers",
  {
    id: idColumn(),
    ...agentWorkColumns(),
    parentSessionId: uuid("parent_session_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    requestId: uuid("request_id").notNull(),
    task: text("task").notNull(),
    status: text("status").$type<HelperStatus>().notNull().default("running"),
    report: text("report"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    ...agentWorkForeignKeys(table, "agent_helpers"),
    foreignKey({
      name: "agent_helpers_parent_session_fk",
      columns: [table.organizationId, table.userAgentId, table.parentSessionId],
      foreignColumns: [agentSessions.organizationId, agentSessions.userAgentId, agentSessions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "agent_helpers_session_fk",
      columns: [table.organizationId, table.userAgentId, table.sessionId],
      foreignColumns: [agentSessions.organizationId, agentSessions.userAgentId, agentSessions.id],
    }).onDelete("cascade"),
    unique("agent_helpers_session_unique").on(table.sessionId),
    unique("agent_helpers_request_unique").on(table.parentSessionId, table.requestId),
    index("agent_helpers_running_idx")
      .on(table.userAgentId)
      .where(sql`${table.status} = 'running'`),
    check("agent_helpers_task_check", sql`length(trim(${table.task})) BETWEEN 1 AND 20000`),
    check(
      "agent_helpers_report_check",
      sql`${table.report} IS NULL OR length(${table.report}) <= 20000`,
    ),
  ],
);
