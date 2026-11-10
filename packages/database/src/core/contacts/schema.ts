import { entityIdentity } from "../entities/identity";
import { entities } from "../entities/schema";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const contacts = pgTable(
  "contacts",
  {
    ...entityIdentity("contact"),
    displayName: text("display_name").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    unique("contacts_organization_entity_unique").on(table.organizationId, table.entityId),
    check("contacts_name_check", sql`length(trim(${table.displayName})) > 0`),
  ],
);

export const contactIdentifierType = pgEnum("contact_identifier_type", ["email", "phone"]);
export const contactIdentifiers = pgTable(
  "contact_identifiers",
  {
    organizationId: text("organization_id").notNull(),
    contactEntityId: uuid("contact_entity_id").notNull(),
    type: contactIdentifierType("type").notNull(),
    value: text("value").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.contactEntityId, table.type, table.value] }),
    foreignKey({
      columns: [table.organizationId, table.contactEntityId],
      foreignColumns: [contacts.organizationId, contacts.entityId],
    }).onDelete("cascade"),
    check("contact_identifiers_value_check", sql`length(trim(${table.value})) > 0`),
  ],
);
