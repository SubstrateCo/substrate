import { organization } from "../../core/organizations/schema";
import { sql } from "drizzle-orm";
import { check, integer, pgTable, text } from "drizzle-orm/pg-core";

export const crmSettings = pgTable(
  "crm_settings",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    defaultCurrency: text("default_currency"),
    // Counts pipeline stage changes. Each one claims the next version by compare-and-set.
    pipelineVersion: integer("pipeline_version").default(0).notNull(),
  },
  (t) => [
    check(
      "crm_settings_currency",
      sql`${t.defaultCurrency} is null or ${t.defaultCurrency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);
