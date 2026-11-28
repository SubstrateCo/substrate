import type { AgentOptionalAppId } from "@substrate/contracts/agents";

import { user } from "../authentication/schema";
import { desktopDevices } from "../devices/schema";
import { idColumn } from "../ids";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const userAgents = pgTable(
  "user_agents",
  {
    id: idColumn(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    instructions: text("instructions").notNull(),
    harness: text("harness", { enum: ["opencode", "claude", "codex"] }).notNull(),
    model: text("model"),
    avatarCode: text("avatar_code").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    disabledApps: jsonb("disabled_apps").$type<AgentOptionalAppId[]>().notNull().default([]),
    substrateGuide: boolean("substrate_guide").notNull().default(true),
    homeDeviceId: uuid("home_device_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    unique("user_agents_owner_id_unique").on(table.userId, table.id),
    foreignKey({
      name: "user_agent_home_device_owner_fk",
      columns: [table.userId, table.homeDeviceId],
      foreignColumns: [desktopDevices.userId, desktopDevices.id],
    }),
    check("user_agents_avatar_code_check", sql`${table.avatarCode} ~ '^1[0-9a-z]{5}$'`),
  ],
);
