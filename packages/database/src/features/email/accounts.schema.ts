import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, unique } from "drizzle-orm/pg-core";
import { entities } from "../../core/entities/schema";
import { entityIdentity } from "../../core/entities/identity";

export const emailAccounts = pgTable(
  "email_accounts",
  {
    ...entityIdentity("email_account"),
    displayName: text("display_name").notNull(),
    emailAddress: text("email_address").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    unique("email_accounts_organization_entity_unique").on(table.organizationId, table.entityId),
    check("email_accounts_name_check", sql`length(trim(${table.displayName})) > 0`),
    check(
      "email_accounts_address_check",
      sql`length(trim(${table.emailAddress})) > 0 AND ${table.emailAddress} = lower(trim(${table.emailAddress}))`,
    ),
  ],
);
