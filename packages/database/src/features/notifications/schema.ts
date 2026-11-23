import { actors } from "../../core/actors/schema";
import { entities } from "../../core/entities/schema";
import { messagingMessages } from "../messaging/schema";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull(),
    recipientActorEntityId: uuid("recipient_actor_entity_id").notNull(),
    kind: text("kind").$type<"assignment" | "mention" | "reply" | "message">().notNull(),
    eventKey: text("event_key").notNull(),
    entityId: uuid("entity_id"),
    messageId: uuid("message_id").references(() => messagingMessages.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.recipientActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.entityId],
      foreignColumns: [entities.organizationId, entities.entityId],
    }).onDelete("cascade"),
    unique("notification_event_recipient_unique").on(table.recipientActorEntityId, table.eventKey),
    check(
      "notification_target_check",
      sql`(${table.entityId} IS NULL) <> (${table.messageId} IS NULL)`,
    ),
    index("notification_recipient_idx").on(
      table.organizationId,
      table.recipientActorEntityId,
      table.createdAt,
      table.id,
    ),
    // The unread feed and mark-all-read.
    index("notification_unread_idx")
      .on(table.organizationId, table.recipientActorEntityId, table.createdAt, table.id)
      .where(sql`${table.readAt} IS NULL`),
    // Message deletion cascades here.
    index("notification_message_idx").on(table.messageId),
    // Retention deletes read notifications by age.
    index("notification_read_created_idx")
      .on(table.createdAt)
      .where(sql`${table.readAt} IS NOT NULL`),
    // Entity deletion cascades here.
    index("notification_entity_idx")
      .on(table.organizationId, table.entityId)
      .where(sql`${table.entityId} IS NOT NULL`),
  ],
);
