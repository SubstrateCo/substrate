import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { foreignKey, text, uuid, type PgColumn } from "drizzle-orm/pg-core";

/** The agent, its organization actor and its owner, on every agent-work control row. */
export const agentWorkColumns = () => ({
  organizationId: text("organization_id").notNull(),
  userAgentId: uuid("user_agent_id").notNull(),
  agentActorEntityId: uuid("agent_actor_entity_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
});

type ProvenanceColumns = {
  organizationId: PgColumn;
  userAgentId: PgColumn;
  agentActorEntityId: PgColumn;
  ownerUserId: PgColumn;
};

/**
 * The owner is the agent definition's owner, and the actor is this user agent's actor in this
 * organization. Deleting the agent or its actor deletes its work.
 */
export function agentWorkForeignKeys(table: ProvenanceColumns, name: string) {
  return [
    foreignKey({
      name: `${name}_owner_fk`,
      columns: [table.ownerUserId, table.userAgentId],
      foreignColumns: [userAgents.userId, userAgents.id],
    }).onDelete("cascade"),
    foreignKey({
      name: `${name}_agent_actor_fk`,
      columns: [table.organizationId, table.agentActorEntityId, table.userAgentId],
      foreignColumns: [actors.organizationId, actors.entityId, actors.userAgentId],
    }).onDelete("cascade"),
  ];
}
