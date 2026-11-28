import type { ContextEntityType } from "@substrate/contracts/context/input";

import { actors } from "../../core/actors/schema";
import { entities, entityType } from "../../core/entities/schema";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { foreignKey, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const messageEntityReferences = pgTable(
  "message_entity_references",
  {
    organizationId: text("organization_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    messageId: uuid("message_id").notNull(),
    entityId: uuid("entity_id").notNull(),
    entityType: entityType("entity_type").$type<ContextEntityType>().notNull(),
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
    index("message_reference_target_idx").on(table.organizationId, table.entityId),
    index("message_reference_conversation_idx").on(table.conversationId),
  ],
);
