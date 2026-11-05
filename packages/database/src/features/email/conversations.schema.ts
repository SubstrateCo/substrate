import { foreignKey, index, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { entities } from "../../core/entities/schema";
import { entityIdentity } from "../../core/entities/identity";
import { entityAccessParents } from "../../core/permissions/access-parents";
import { emailAccounts } from "./accounts.schema";

export const emailConversations = pgTable(
  "email_conversations",
  {
    ...entityIdentity("email_conversation"),
    emailAccountEntityId: uuid("email_account_entity_id").notNull(),
    subject: text("subject").default("").notNull(),
    providerConversationId: text("provider_conversation_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.entityId, table.entityType],
      foreignColumns: [entities.organizationId, entities.entityId, entities.entityType],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.emailAccountEntityId],
      foreignColumns: [emailAccounts.organizationId, emailAccounts.entityId],
    }),
    foreignKey({
      columns: [table.organizationId, table.entityId, table.emailAccountEntityId],
      foreignColumns: [
        entityAccessParents.organizationId,
        entityAccessParents.entityId,
        entityAccessParents.parentEntityId,
      ],
    }),
    unique("email_conversations_account_entity_unique").on(
      table.organizationId,
      table.entityId,
      table.emailAccountEntityId,
    ),
    unique("email_conversations_provider_unique").on(
      table.emailAccountEntityId,
      table.providerConversationId,
    ),
    index("email_conversations_account_idx").on(
      table.organizationId,
      table.emailAccountEntityId,
      table.entityId,
    ),
  ],
);
