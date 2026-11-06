import { user } from "../authentication/schema";
import { entityIdentity } from "../entities/identity";
import { entities } from "../entities/schema";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export interface AgentConfiguration {
  model?: string;
  instructions?: string;
}

export const actorType = pgEnum("actor_type", ["human", "agent"]);

export const actors = pgTable(
  "actors",
  {
    ...entityIdentity("actor"),
    type: actorType("type").notNull(),
    userId: text("user_id").references(() => user.id),
    name: text("name").notNull(),
    agentConfig: jsonb("agent_config").$type<AgentConfiguration>(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    unique("actors_organization_entity_unique").on(table.organizationId, table.entityId),
    unique("actors_organization_user_unique").on(table.organizationId, table.userId),
    index("actors_user_idx").on(table.userId),
    check(
      "actors_identity_check",
      sql`(${table.type} = 'human' AND ${table.userId} IS NOT NULL AND ${table.agentConfig} IS NULL) OR (${table.type} = 'agent' AND ${table.userId} IS NULL)`,
    ),
    check("actors_name_check", sql`length(trim(${table.name})) > 0`),
  ],
);
