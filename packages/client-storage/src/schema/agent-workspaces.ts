import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * The folder the owner chose for an agent's sessions to work in on this desktop. Without a row,
 * sessions work in the agent's own folder. A path names a folder on this device only, so it is
 * not sent to the server. Times are epoch ms.
 */
export const agentWorkspaces = sqliteTable(
  "agent_workspaces",
  {
    organizationId: text("organization_id").notNull(),
    /** The harness agent ID, which also names the agent folder. */
    agentId: text("agent_id").notNull(),
    /** An absolute folder path. The harness checks it at each session open. */
    path: text("path").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.agentId] })],
);
