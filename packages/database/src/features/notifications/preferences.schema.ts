import type {
  NotificationFlashMode,
  NotificationLevel,
  NotificationPreview,
} from "@substrate/contracts/notifications/preferences";

import { user } from "../../core/authentication/schema";
import { member } from "../../core/organizations/schema";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    alertsEnabled: boolean("alerts_enabled").default(true).notNull(),
    pausedUntil: timestamp("paused_until", { withTimezone: true }),
    scheduleDays: smallint("schedule_days"),
    scheduleStart: smallint("schedule_start"),
    scheduleEnd: smallint("schedule_end"),
    scheduleTimeZone: text("schedule_time_zone"),
    preview: text("preview").$type<NotificationPreview>().default("hidden").notNull(),
    sound: boolean("sound").default(true).notNull(),
    flash: text("flash").$type<NotificationFlashMode>().default("idle").notNull(),
  },
  (table) => [
    check(
      "notification_schedule_check",
      sql`(${table.scheduleDays} IS NULL AND ${table.scheduleStart} IS NULL AND ${table.scheduleEnd} IS NULL AND ${table.scheduleTimeZone} IS NULL)
        OR (${table.scheduleDays} BETWEEN 1 AND 127
          AND ${table.scheduleStart} BETWEEN 0 AND 1439
          AND ${table.scheduleEnd} BETWEEN 0 AND 1439
          AND ${table.scheduleStart} <> ${table.scheduleEnd}
          AND length(${table.scheduleTimeZone}) BETWEEN 1 AND 100)`,
    ),
  ],
);

export const notificationWorkspacePreferences = pgTable(
  "notification_workspace_preferences",
  {
    organizationId: text("organization_id").notNull(),
    userId: text("user_id").notNull(),
    channels: text("channels").$type<NotificationLevel>().default("mentions").notNull(),
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    assignments: boolean("assignments").default(true).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId] }),
    foreignKey({
      columns: [table.organizationId, table.userId],
      foreignColumns: [member.organizationId, member.userId],
    }).onDelete("cascade"),
  ],
);
