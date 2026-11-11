import type { McpOutput, ServerToolName } from "@substrate/contracts/harness/tools";

import { actors } from "../../core/actors/schema";
import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";

export const agentToolRequests = pgTable(
  "agent_tool_requests",
  {
    organizationId: text("organization_id").notNull(),
    actorEntityId: uuid("actor_entity_id").notNull(),
    tool: text("tool").notNull(),
    requestId: uuid("request_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    result: jsonb("result").$type<McpOutput<ServerToolName>>().notNull(),
    // The local turn and attempt that made the write, so recovery can see what already happened.
    turnId: uuid("turn_id"),
    attempt: integer("attempt"),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.actorEntityId, table.tool, table.requestId],
    }),
    foreignKey({
      columns: [table.organizationId, table.actorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    index("agent_tool_requests_turn_idx")
      .on(table.turnId)
      .where(sql`${table.turnId} IS NOT NULL`),
  ],
);
