import { actors } from "../../../core/actors/schema";
import { messagingConversations } from "../schema";
import { foreignKey, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.actorEntityId] }),
    foreignKey({
      columns: [table.organizationId, table.actorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }).onDelete("cascade"),
  ],
);
