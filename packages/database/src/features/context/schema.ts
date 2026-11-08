import { actors } from "../../core/actors/schema";
import { entities, entityType } from "../../core/entities/schema";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { tasks } from "../tasks/tasks.schema";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const messageEntityReferences = pgTable(
  "message_entity_references",
  {
    organizationId: text("organization_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    messageId: uuid("message_id").notNull(),
    entityId: uuid("entity_id").notNull(),
    entityType: entityType("entity_type").notNull(),
    purpose: text("purpose").$type<"source" | "mention" | "association">().notNull(),
    createdByActorEntityId: uuid("created_by_actor_entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.entityId, table.purpose] }),
    foreignKey({
      columns: [table.organizationId, table.conversationId],
      foreignColumns: [messagingConversations.organizationId, messagingConversations.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId, table.messageId],
      foreignColumns: [messagingMessages.conversationId, messagingMessages.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.createdByActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    check("message_reference_type_check", sql`${table.entityType} IN ('task', 'project')`),
    check(
      "message_reference_purpose_check",
      sql`${table.purpose} IN ('source', 'mention', 'association')`,
    ),
    index("message_reference_target_idx").on(table.organizationId, table.entityId),
    // Conversation deletion cascades here, and delete impact counts by conversation.
    index("message_reference_conversation_idx").on(table.conversationId),
  ],
);

export const sourceTaskRequests = pgTable(
  "source_task_requests",
  {
    organizationId: text("organization_id").notNull(),
    actorEntityId: uuid("actor_entity_id").notNull(),
    requestId: uuid("request_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    taskEntityId: uuid("task_entity_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.actorEntityId, table.requestId] }),
    foreignKey({
      columns: [table.organizationId, table.actorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    foreignKey({
      columns: [table.organizationId, table.taskEntityId],
      foreignColumns: [tasks.organizationId, tasks.entityId],
    }),
  ],
);

export const messageMessagingReferences = pgTable(
  "message_messaging_references",
  {
    organizationId: text("organization_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    messageId: uuid("message_id").notNull(),
    kind: text("kind").$type<"channel" | "thread">().notNull(),
    targetId: uuid("target_id").notNull(),
    targetConversationId: uuid("target_conversation_id").notNull(),
    targetThreadId: uuid("target_thread_id"),
    threadRoot: boolean("thread_root").default(true).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.kind, table.targetId] }),
    foreignKey({
      columns: [table.organizationId, table.conversationId],
      foreignColumns: [messagingConversations.organizationId, messagingConversations.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId, table.messageId],
      foreignColumns: [messagingMessages.conversationId, messagingMessages.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.targetConversationId],
      foreignColumns: [messagingConversations.organizationId, messagingConversations.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.targetConversationId, table.targetThreadId, table.threadRoot],
      foreignColumns: [
        messagingMessages.conversationId,
        messagingMessages.id,
        messagingMessages.isRoot,
      ],
    }).onDelete("cascade"),
    check(
      "messaging_reference_target_check",
      sql`
      (${table.kind} = 'channel' AND ${table.targetId} = ${table.targetConversationId} AND ${table.targetThreadId} IS NULL)
      OR (${table.kind} = 'thread' AND ${table.targetThreadId} IS NOT NULL AND ${table.targetId} = ${table.targetThreadId})
    `,
    ),
    check("messaging_reference_root_check", sql`${table.threadRoot}`),
    index("messaging_reference_target_idx").on(
      table.organizationId,
      table.targetConversationId,
      table.targetThreadId,
    ),
  ],
);
