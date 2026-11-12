import { user } from "../authentication/schema";
import { entityIdentity } from "../entities/identity";
import { entities } from "../entities/schema";
import { userAgents } from "./user-agents.schema";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const actorType = pgEnum("actor_type", ["human", "agent"]);

export const actors = pgTable(
  "actors",
  {
    ...entityIdentity("actor"),
    type: actorType("type").notNull(),
    userId: text("user_id").references(() => user.id),
    userAgentId: uuid("user_agent_id").references(() => userAgents.id),
    // Names come from the user or the user agent: see actorDisplayName.
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    unique("actors_organization_entity_unique").on(table.organizationId, table.entityId),
    unique("actors_organization_entity_type_unique").on(
      table.organizationId,
      table.entityId,
      table.type,
    ),
    unique("actors_organization_user_unique").on(table.organizationId, table.userId),
    unique("actors_organization_user_agent_unique").on(table.organizationId, table.userAgentId),
    // Lets agent-work rows bind their actor to the user agent it represents.
    unique("actors_organization_entity_user_agent_unique").on(
      table.organizationId,
      table.entityId,
      table.userAgentId,
    ),
    // Lets caller rows bind a person's actor to that person.
    unique("actors_organization_entity_user_unique").on(
      table.organizationId,
      table.entityId,
      table.userId,
    ),
    index("actors_user_idx").on(table.userId),
    check(
      "actors_identity_check",
      sql`(${table.type} = 'human' AND ${table.userId} IS NOT NULL) OR (${table.type} = 'agent' AND ${table.userId} IS NULL)`,
    ),
    check(
      "actors_user_agent_type_check",
      sql`${table.userAgentId} IS NULL OR ${table.type} = 'agent'`,
    ),
  ],
);
