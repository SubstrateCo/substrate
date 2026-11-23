import type { AgentWakeSource, AgentWakeSourceRef } from "@substrate/contracts/agent-work";

import { actors } from "../../../core/actors/schema";
import { userAgents } from "../../../core/actors/user-agents.schema";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// A durable notice that an owner-authorized event happened for an agent. It holds references,
// not bodies: the home desktop loads bodies through device sources, which re-checks access.
export const agentWakes = pgTable(
  "agent_wakes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull(),
    userAgentId: uuid("user_agent_id").notNull(),
    agentActorEntityId: uuid("agent_actor_entity_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    source: text("source").$type<AgentWakeSource>().notNull(),
    sourceRef: jsonb("source_ref").$type<AgentWakeSourceRef>().notNull(),
    sessionKey: text("session_key").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    ackedAt: timestamp("acked_at", { withTimezone: true }),
  },
  (table) => [
    // The owner is the agent definition's owner, never another person.
    foreignKey({
      columns: [table.ownerUserId, table.userAgentId],
      foreignColumns: [userAgents.userId, userAgents.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.agentActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }).onDelete("cascade"),
    // The actor is this user agent's actor, so it is an agent actor in this organization.
    foreignKey({
      name: "agent_wakes_agent_actor_fk",
      columns: [table.organizationId, table.agentActorEntityId, table.userAgentId],
      foreignColumns: [actors.organizationId, actors.entityId, actors.userAgentId],
    }).onDelete("cascade"),
    unique("agent_wakes_dedupe_unique").on(table.userAgentId, table.dedupeKey),
    // Acked wakes stay, so the polling index covers pending rows only, in pull order.
    index("agent_wakes_pending_idx")
      .on(table.userAgentId, table.createdAt, table.id)
      .where(sql`${table.ackedAt} IS NULL`),
    check("agent_wake_session_key_check", sql`length(${table.sessionKey}) BETWEEN 1 AND 200`),
  ],
);
