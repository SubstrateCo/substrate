import { entityTypes } from "@substrate/contracts/access/entity-rules";

import { idColumn } from "../ids";
import { organization } from "../organizations/schema";
import {
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  index,
} from "drizzle-orm/pg-core";

export const entityType = pgEnum("entity_type", entityTypes);

export const entities = pgTable(
  "entities",
  {
    entityId: idColumn("entity_id"),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    entityType: entityType("entity_type").notNull(),
    accessEntityId: uuid("access_entity_id").notNull(),
    accessVersion: integer("access_version").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    unique("entities_organization_entity_unique").on(table.organizationId, table.entityId),
    unique("entities_organization_entity_type_unique").on(
      table.organizationId,
      table.entityId,
      table.entityType,
    ),
    unique("entities_organization_entity_access_unique").on(
      table.organizationId,
      table.entityId,
      table.accessEntityId,
    ),
    foreignKey({
      columns: [table.organizationId, table.accessEntityId],
      foreignColumns: [table.organizationId, table.entityId],
    }),
    index("entities_organization_access_idx").on(table.organizationId, table.accessEntityId),
  ],
);
