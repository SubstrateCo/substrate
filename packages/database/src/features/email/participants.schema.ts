import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { contacts } from "../../core/contacts/schema";
import { emailMessages } from "./messages.schema";

export const emailParticipantKind = pgEnum("email_participant_kind", [
  "from",
  "to",
  "cc",
  "bcc",
  "reply_to",
]);
export const emailParticipants = pgTable(
  "email_participants",
  {
    organizationId: text("organization_id").notNull(),
    emailMessageEntityId: uuid("email_message_entity_id").notNull(),
    kind: emailParticipantKind("kind").notNull(),
    address: text("address").notNull(),
    displayName: text("display_name"),
    contactEntityId: uuid("contact_entity_id"),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.emailMessageEntityId, table.kind, table.address],
    }),
    foreignKey({
      columns: [table.organizationId, table.emailMessageEntityId],
      foreignColumns: [emailMessages.organizationId, emailMessages.entityId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.contactEntityId],
      foreignColumns: [contacts.organizationId, contacts.entityId],
    }),
    index("email_participants_contact_idx").on(table.organizationId, table.contactEntityId),
    check(
      "email_participants_address_check",
      sql`length(trim(${table.address})) > 0 AND ${table.address} = lower(trim(${table.address}))`,
    ),
  ],
);
