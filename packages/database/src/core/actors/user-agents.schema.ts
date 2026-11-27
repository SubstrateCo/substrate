import { user } from "../authentication/schema";
import { desktopDevices } from "../devices/schema";
import { idColumn } from "../ids";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// User-owned definitions retain organization-scoped actors for attribution.
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
    // How the agent looks, as a code from @substrate/agent-avatars. Generated from the agent's
    // ID when it is created; the owner may change it.
    avatarCode: text("avatar_code").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    useStartupDefaults: boolean("use_startup_defaults").notNull().default(true),
    // The desktop that runs this local agent. Its working folder lives on that device.
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
