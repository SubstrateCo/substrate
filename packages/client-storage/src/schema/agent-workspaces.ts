import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const agentWorkspaces = sqliteTable(
  "agent_workspaces",
  {
    organizationId: text("organization_id").notNull(),
    agentId: text("agent_id").notNull(),
    path: text("path").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.agentId] })],
);
