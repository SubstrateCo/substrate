import { permissionLevels } from "@substrate/contracts/tasks";

import { actors, actorType } from "../actors/schema";
import { entities } from "../entities/schema";
import { sql } from "drizzle-orm";
import { foreignKey, index, pgEnum, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

export const permissionLevel = pgEnum("permission_level", permissionLevels);

export const entityGrants = pgTable(
  "entity_grants",
  {
    organizationId: text("organization_id").notNull(),
    entityId: uuid("entity_id").notNull(),
    accessEntityId: uuid("access_entity_id")
      .generatedAlwaysAs(sql`entity_id`)
      .notNull(),
    actorEntityId: uuid("actor_entity_id").notNull(),
    actorType: actorType("actor_type").generatedAlwaysAs(sql.raw(`'human'::actor_type`)).notNull(),
    level: permissionLevel("level").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.entityId, table.actorEntityId] }),
    foreignKey({
      name: "entity_grants_container_fk",
      columns: [table.organizationId, table.entityId, table.accessEntityId],
      foreignColumns: [entities.organizationId, entities.entityId, entities.accessEntityId],
    }).onDelete("cascade"),
    foreignKey({
      name: "entity_grants_human_actor_fk",
      columns: [table.organizationId, table.actorEntityId, table.actorType],
      foreignColumns: [actors.organizationId, actors.entityId, actors.type],
    }).onDelete("cascade"),
    index("entity_grants_actor_idx").on(table.organizationId, table.actorEntityId, table.entityId),
  ],
);
