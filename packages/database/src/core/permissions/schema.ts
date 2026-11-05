import { foreignKey, index, pgEnum, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { actors } from "../actors/schema";
import { entities } from "../entities/schema";

export const permissionLevel = pgEnum("permission_level", ["view", "comment", "edit", "owner"]);

export const entityGrants = pgTable(
  "entity_grants",
  {
    organizationId: text("organization_id").notNull(),
    entityId: uuid("entity_id").notNull(),
    actorEntityId: uuid("actor_entity_id").notNull(),
    level: permissionLevel("level").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.entityId, table.actorEntityId] }),
    foreignKey({
      columns: [table.organizationId, table.entityId],
      foreignColumns: [entities.organizationId, entities.entityId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.actorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }).onDelete("cascade"),
    index("entity_grants_actor_idx").on(table.organizationId, table.actorEntityId, table.entityId),
  ],
);
