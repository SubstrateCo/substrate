import { entityIdentity } from "../entities/identity";
import { entities } from "../entities/schema";
import { sql } from "drizzle-orm";
import {
  check,
  boolean,
  index,
  foreignKey,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const contacts = pgTable(
  "contacts",
  {
    ...entityIdentity("contact"),
    displayName: text("display_name").notNull(),
    givenName: text("given_name"),
    middleName: text("middle_name"),
    familyName: text("family_name"),
    namePrefix: text("name_prefix"),
    nameSuffix: text("name_suffix"),
    nickname: text("nickname"),
    notes: text("notes"),
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
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull(),
    contactEntityId: uuid("contact_entity_id").notNull(),
    type: contactIdentifierType("type").notNull(),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value"),
    label: text("label"),
    extension: text("extension"),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("contact_identifiers_value_unique").on(
      table.organizationId,
      table.contactEntityId,
      table.type,
      sql`coalesce(${table.normalizedValue}, ${table.value})`,
      sql`coalesce(${table.extension}, '')`,
    ),
    uniqueIndex("contact_identifiers_primary_unique")
      .on(table.organizationId, table.contactEntityId, table.type)
      .where(sql`${table.isPrimary}`),
    index("contact_identifiers_lookup_idx").on(
      table.organizationId,
      table.type,
      table.normalizedValue,
    ),
    foreignKey({
      columns: [table.organizationId, table.contactEntityId],
      foreignColumns: [contacts.organizationId, contacts.entityId],
    }).onDelete("cascade"),
    check("contact_identifiers_value_check", sql`length(trim(${table.value})) > 0`),
    check(
      "contact_identifiers_extension_check",
      sql`${table.extension} IS NULL OR (${table.type} = 'phone' AND ${table.extension} ~ '^[0-9]+$')`,
    ),
  ],
);
