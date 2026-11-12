import { organization } from "../../core/organizations/schema";
import { sql } from "drizzle-orm";
import { pgTable, text, check } from "drizzle-orm/pg-core";

export const crmSettings = pgTable(
  "crm_settings",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    defaultCurrency: text("default_currency"),
  },
  (t) => [
    check(
      "crm_settings_currency",
      sql`${t.defaultCurrency} is null or ${t.defaultCurrency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);
