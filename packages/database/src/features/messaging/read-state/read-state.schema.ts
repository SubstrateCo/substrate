import { actors } from "../../../core/actors/schema";
import { messagingConversations, messagingMessages } from "../schema";
import { foreignKey, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const messagingReadPositions = pgTable(
  "messaging_read_positions",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => messagingConversations.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    actorEntityId: uuid("actor_entity_id").notNull(),
    messageId: uuid("message_id").notNull(),
    messageCreatedAt: timestamp("message_created_at", { withTimezone: true }).notNull(),
    viewingUntil: timestamp("viewing_until", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.actorEntityId] }),
    foreignKey({
      columns: [table.organizationId, table.actorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }).onDelete("cascade"),
  ],
);

export const messagingThreadReadPositions = pgTable(
  "messaging_thread_read_positions",
  {
    conversationId: uuid("conversation_id").notNull(),
    threadId: uuid("thread_id").notNull(),
    organizationId: text("organization_id").notNull(),
    actorEntityId: uuid("actor_entity_id").notNull(),
    messageId: uuid("message_id").notNull(),
    messageCreatedAt: timestamp("message_created_at", { withTimezone: true }).notNull(),
    viewingUntil: timestamp("viewing_until", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.threadId, table.actorEntityId] }),
    foreignKey({
      name: "messaging_thread_read_positions_thread_fk",
      columns: [table.conversationId, table.threadId],
      foreignColumns: [messagingMessages.conversationId, messagingMessages.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "messaging_thread_read_positions_actor_fk",
      columns: [table.organizationId, table.actorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }).onDelete("cascade"),
  ],
);
