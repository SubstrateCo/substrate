import { organization } from "../organizations/schema";
import { pgEnum, pgTable, text, timestamp, unique, uuid, index } from "drizzle-orm/pg-core";

export const entityType = pgEnum("entity_type", [
  "actor",
  "contact",
  "company",
  "project",
  "task",
  "file",
  "folder",
  "pipeline",
  "deal",
  "email_account",
  "email_conversation",
  "email_message",
  "channel",
  "thread",
  "message",
  "calendar",
  "calendar_event",
]);

export const entities = pgTable(
  "entities",
  {
    entityId: uuid("entity_id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    entityType: entityType("entity_type").notNull(),
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
    index("entities_organization_type_idx").on(table.organizationId, table.entityType),
  ],
);
