import type { McpOutput, McpToolName } from "@startup-os/contracts/harness/tools";

import { actors } from "../../core/actors/schema";
import { foreignKey, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

export const agentToolRequests = pgTable(
  "agent_tool_requests",
  {
    organizationId: text("organization_id").notNull(),
    actorEntityId: uuid("actor_entity_id").notNull(),
    tool: text("tool").notNull(),
    requestId: uuid("request_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    result: jsonb("result").$type<McpOutput<McpToolName>>().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.actorEntityId, table.tool, table.requestId],
    }),
    foreignKey({
      columns: [table.organizationId, table.actorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
  ],
);
