import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { member } from "../../core/organizations/schema";
import { foreignKey, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

// People whose calls skip approval when the agent's policy is ask. One row per agent,
// organization and person. A person who leaves the organization leaves the list.
export const userAgentCallers = pgTable(
  "user_agent_callers",
  {
    organizationId: text("organization_id").notNull(),
    userAgentId: uuid("user_agent_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    callerUserId: text("caller_user_id").notNull(),
    callerActorEntityId: uuid("caller_actor_entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userAgentId, table.organizationId, table.callerUserId] }),
    // The owner is the agent definition's owner.
    foreignKey({
      columns: [table.ownerUserId, table.userAgentId],
      foreignColumns: [userAgents.userId, userAgents.id],
    }).onDelete("cascade"),
    // The agent has an actor in this organization.
    foreignKey({
      name: "user_agent_callers_agent_fk",
      columns: [table.organizationId, table.userAgentId],
      foreignColumns: [actors.organizationId, actors.userAgentId],
    }).onDelete("cascade"),
    // The caller is a person of this organization, through their own actor.
    foreignKey({
      name: "user_agent_callers_caller_fk",
      columns: [table.organizationId, table.callerActorEntityId, table.callerUserId],
      foreignColumns: [actors.organizationId, actors.entityId, actors.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "user_agent_callers_member_fk",
      columns: [table.organizationId, table.callerUserId],
      foreignColumns: [member.organizationId, member.userId],
    }).onDelete("cascade"),
  ],
);
