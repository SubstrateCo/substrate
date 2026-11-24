import { idColumn } from "../ids";
import { contacts } from "./schema";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

function detailColumns() {
  return {
    id: idColumn(),
    organizationId: text("organization_id").notNull(),
    contactEntityId: uuid("contact_entity_id").notNull(),
    label: text("label"),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  };
}

export const contactAddresses = pgTable(
  "contact_addresses",
  {
    ...detailColumns(),
    streetAddress: text("street_address"),
    extendedAddress: text("extended_address"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    countryCode: text("country_code"),
    formattedAddress: text("formatted_address"),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.contactEntityId],
      foreignColumns: [contacts.organizationId, contacts.entityId],
    }).onDelete("cascade"),
    index("contact_addresses_contact_idx").on(table.organizationId, table.contactEntityId),
    uniqueIndex("contact_addresses_primary_unique")
      .on(table.organizationId, table.contactEntityId)
      .where(sql`${table.isPrimary}`),
    check(
      "contact_addresses_nonempty_check",
      sql`length(trim(concat_ws('', ${table.streetAddress}, ${table.extendedAddress}, ${table.city}, ${table.region}, ${table.postalCode}, ${table.countryCode}, ${table.formattedAddress}))) > 0`,
    ),
    check(
      "contact_addresses_country_check",
      sql`${table.countryCode} IS NULL OR ${table.countryCode} ~ '^[A-Z]{2}$'`,
    ),
  ],
);

export const contactUrls = pgTable(
  "contact_urls",
  {
    ...detailColumns(),
    url: text("url").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.contactEntityId],
      foreignColumns: [contacts.organizationId, contacts.entityId],
    }).onDelete("cascade"),
    uniqueIndex("contact_urls_value_unique").on(
      table.organizationId,
      table.contactEntityId,
      table.url,
    ),
    uniqueIndex("contact_urls_primary_unique")
      .on(table.organizationId, table.contactEntityId)
      .where(sql`${table.isPrimary}`),
    check("contact_urls_scheme_check", sql`${table.url} ~ '^https?://'`),
  ],
);
