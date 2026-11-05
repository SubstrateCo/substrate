import {
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { entities } from "../../core/entities/schema";
import { entityIdentity } from "../../core/entities/identity";
import { entityAccessParents } from "../../core/permissions/access-parents";
import { emailConversations } from "./conversations.schema";

export const emailDirection = pgEnum("email_direction", ["inbound", "outbound", "draft"]);
export const emailMessages = pgTable(
  "email_messages",
  {
    ...entityIdentity("email_message"),
    emailAccountEntityId: uuid("email_account_entity_id").notNull(),
    conversationEntityId: uuid("conversation_entity_id").notNull(),
    providerMessageId: text("provider_message_id"),
    internetMessageId: text("internet_message_id"),
    subject: text("subject").default("").notNull(),
    textBody: text("text_body"),
    htmlBody: text("html_body"),
    direction: emailDirection("direction").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.conversationEntityId, table.emailAccountEntityId],
      foreignColumns: [
        emailConversations.organizationId,
        emailConversations.entityId,
        emailConversations.emailAccountEntityId,
      ],
    }),
    foreignKey({
      columns: [table.organizationId, table.entityId, table.conversationEntityId],
      foreignColumns: [
        entityAccessParents.organizationId,
        entityAccessParents.entityId,
        entityAccessParents.parentEntityId,
      ],
    }),
    unique("email_messages_organization_entity_unique").on(table.organizationId, table.entityId),
    unique("email_messages_provider_unique").on(
      table.emailAccountEntityId,
      table.providerMessageId,
    ),
    index("email_messages_conversation_idx").on(
      table.organizationId,
      table.conversationEntityId,
      table.entityId,
    ),
  ],
);
