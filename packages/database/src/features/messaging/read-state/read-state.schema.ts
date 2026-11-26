import { actors } from "../../../core/actors/schema";
import { messagingConversations, messagingMessages } from "../schema";
import { foreignKey, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

// The reader's position in a conversation's main timeline. Thread replies have their own positions.
export const messagingReadPositions = pgTable(
  "messaging_read_positions",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => messagingConversations.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    actorEntityId: uuid("actor_entity_id").notNull(),
    // Keep the position even if its message is deleted.
    messageId: uuid("message_id").notNull(),
    messageCreatedAt: timestamp("message_created_at", { withTimezone: true }).notNull(),
    // The reader has the newest message in view in a focused window until this time. New messages
    // that arrive before it are read as they are sent, so they never show as unread.
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

// The reader's position in one thread's replies.
export const messagingThreadReadPositions = pgTable(
  "messaging_thread_read_positions",
  {
    conversationId: uuid("conversation_id").notNull(),
    threadId: uuid("thread_id").notNull(),
    organizationId: text("organization_id").notNull(),
    actorEntityId: uuid("actor_entity_id").notNull(),
    // Keep the position even if its message is deleted. The root marks a thread with no replies read.
    messageId: uuid("message_id").notNull(),
    messageCreatedAt: timestamp("message_created_at", { withTimezone: true }).notNull(),
    viewingUntil: timestamp("viewing_until", { withTimezone: true }),
  },
  (table) => [
    // Also serves the viewer lookup when a reply is sent.
    primaryKey({ columns: [table.threadId, table.actorEntityId] }),
    // The thread root belongs to the conversation, and its positions go with it.
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
