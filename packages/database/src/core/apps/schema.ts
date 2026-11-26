import type { OrganizationOptionalAppId, UserAppId } from "@substrate/contracts/apps";

import { member, organization } from "../organizations/schema";
import { boolean, foreignKey, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const organizationApps = pgTable(
  "organization_apps",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    appId: text("app_id").$type<OrganizationOptionalAppId>().notNull(),
    enabled: boolean("enabled").default(false).notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.appId] })],
);

export const userApps = pgTable(
  "user_apps",
  {
    organizationId: text("organization_id").notNull(),
    userId: text("user_id").notNull(),
    appId: text("app_id").$type<UserAppId>().notNull(),
    enabled: boolean("enabled").default(false).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId, table.appId] }),
    foreignKey({
      columns: [table.organizationId, table.userId],
      foreignColumns: [member.organizationId, member.userId],
    }).onDelete("cascade"),
  ],
);
