import type { OptionalAppId } from "@substrate/contracts/apps";

import { organization } from "../organizations/schema";
import { boolean, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const organizationApps = pgTable(
  "organization_apps",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    appId: text("app_id").$type<OptionalAppId>().notNull(),
    enabled: boolean("enabled").default(false).notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.appId] })],
);
