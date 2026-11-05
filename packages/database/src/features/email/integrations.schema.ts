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
import { emailAccounts } from "./accounts.schema";

export const emailProvider = pgEnum("email_provider", ["google", "microsoft", "imap"]);
export const emailConnectionStatus = pgEnum("email_connection_status", ["active", "paused"]);
export const emailIntegrations = pgTable(
  "email_integrations",
  {
    emailAccountEntityId: uuid("email_account_entity_id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    provider: emailProvider("provider").notNull(),
    externalAccountId: text("external_account_id").notNull(),
    externalResourceId: text("external_resource_id").notNull(),
    connectedByActorEntityId: uuid("connected_by_actor_entity_id").notNull(),
    credentialReference: text("credential_reference").notNull(),
    connectionStatus: emailConnectionStatus("connection_status").default("active").notNull(),
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
      columns: [table.organizationId, table.emailAccountEntityId],
      foreignColumns: [emailAccounts.organizationId, emailAccounts.entityId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.connectedByActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    unique("email_integrations_external_resource_unique").on(
      table.organizationId,
      table.provider,
      table.externalAccountId,
      table.externalResourceId,
    ),
    check(
      "email_integrations_required_values",
      sql`length(trim(${table.externalAccountId})) > 0 AND length(trim(${table.externalResourceId})) > 0 AND length(trim(${table.credentialReference})) > 0`,
    ),
    check(
      "email_integrations_lease_check",
      sql`(${table.syncLeaseToken} IS NULL) = (${table.syncLeaseExpiresAt} IS NULL)`,
    ),
  ],
);
