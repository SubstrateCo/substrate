import { sql } from "drizzle-orm";
import { check, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const agentMcpServers = sqliteTable(
  "agent_mcp_servers",
  {
    organizationId: text("organization_id").notNull(),
    agentId: text("agent_id").notNull(),
    id: text("id").notNull(),
    name: text("name").notNull(),
    transport: text("transport").$type<"stdio" | "http">().notNull(),
    command: text("command"),
    args: text("args", { mode: "json" }).$type<string[]>().notNull().default([]),
    environment: text("environment", { mode: "json" })
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    url: text("url"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.agentId, table.id] }),
    check(
      "agent_mcp_servers_transport",
      sql`(${table.transport} = 'stdio' AND ${table.command} IS NOT NULL AND ${table.url} IS NULL) OR (${table.transport} = 'http' AND ${table.url} IS NOT NULL AND ${table.command} IS NULL)`,
    ),
  ],
);
