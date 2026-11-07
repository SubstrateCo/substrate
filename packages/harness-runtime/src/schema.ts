import type { HarnessConfiguration, HarnessKind } from "@startup-os/contracts/harness";

import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const configurationState = sqliteTable("configuration_state", {
  organizationId: text("organization_id").primaryKey(),
  configuration: text("configuration", { mode: "json" }).$type<HarnessConfiguration>().notNull(),
});

export const nativeSessionRefs = sqliteTable("native_session_refs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  agentId: text("agent_id").notNull(),
  harness: text("harness").$type<HarnessKind>().notNull(),
  nativeSessionId: text("native_session_id").notNull(),
});
