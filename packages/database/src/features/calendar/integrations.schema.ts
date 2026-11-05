import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { actors } from "../../core/actors/schema";
import { calendars } from "./calendars.schema";

export const calendarProvider = pgEnum("calendar_provider", ["google", "microsoft", "caldav"]);
export const calendarConnectionStatus = pgEnum("calendar_connection_status", ["active", "paused"]);
export const calendarIntegrations = pgTable(
  "calendar_integrations",
  {
    calendarEntityId: uuid("calendar_entity_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    provider: calendarProvider("provider").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    externalResourceId: text("external_resource_id").notNull(),
    connectedByActorEntityId: uuid("connected_by_actor_entity_id").notNull(),
    credentialReference: text("credential_reference").notNull(),
    connectionStatus: calendarConnectionStatus("connection_status").default("active").notNull(),
    syncCursor: text("sync_cursor"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncAttemptAt: timestamp("last_sync_attempt_at", { withTimezone: true }),
    lastSyncError: text("last_sync_error"),
    syncLeaseToken: uuid("sync_lease_token"),
    syncLeaseExpiresAt: timestamp("sync_lease_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.calendarEntityId],
      foreignColumns: [calendars.organizationId, calendars.entityId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.connectedByActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    unique("calendar_integrations_external_resource_unique").on(
      table.organizationId,
      table.provider,
      table.externalAccountId,
      table.externalResourceId,
    ),
    check(
      "calendar_integrations_required_values",
      sql`length(trim(${table.externalAccountId})) > 0 AND length(trim(${table.externalResourceId})) > 0 AND length(trim(${table.credentialReference})) > 0`,
    ),
    check(
      "calendar_integrations_lease_check",
      sql`(${table.syncLeaseToken} IS NULL) = (${table.syncLeaseExpiresAt} IS NULL)`,
    ),
  ],
);
