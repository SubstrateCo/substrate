import { actors } from "../../core/actors/schema";
import { contactInteractions } from "../../core/contacts/interactions.schema";
import { organization } from "../../core/organizations/schema";
import { pgTable, text, uuid, timestamp, foreignKey, unique } from "drizzle-orm/pg-core";

// Message IDs are durable provenance, not entity IDs or access grants. Deliberately no message
// cascade: deleting a discussion must not erase publication identity or permit republishing.
export const crmInteractionPublications = pgTable(
  "crm_interaction_publications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contactEntityId: uuid("contact_entity_id").notNull(),
    interactionEntityId: uuid("interaction_entity_id").notNull(),
    messageId: uuid("message_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    publisherActorEntityId: uuid("publisher_actor_entity_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: "crm_publication_interaction_fk",
      columns: [t.organizationId, t.interactionEntityId, t.contactEntityId],
      foreignColumns: [
        contactInteractions.organizationId,
        contactInteractions.entityId,
        contactInteractions.contactEntityId,
      ],
    }),
    foreignKey({
      name: "crm_publication_publisher_fk",
      columns: [t.organizationId, t.publisherActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    unique("crm_publication_contact_message_unique").on(
      t.organizationId,
      t.contactEntityId,
      t.messageId,
    ),
    unique("crm_publication_interaction_unique").on(t.organizationId, t.interactionEntityId),
  ],
);
