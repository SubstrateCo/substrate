import type { HarnessConfiguration } from "@startup-os/contracts/harness";

import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const configurationState = sqliteTable("configuration_state", {
  organizationId: text("organization_id").primaryKey(),
  configuration: text("configuration", { mode: "json" }).$type<HarnessConfiguration>().notNull(),
});
