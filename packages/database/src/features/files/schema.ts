import { actors } from "../../core/actors/schema";
import { storedFiles } from "../../core/storage/schema";
import { messagingMessages } from "../messaging/schema";
import { tasks } from "../tasks/tasks.schema";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const fields = () => ({
  id: uuid("id").defaultRandom().primaryKey(),
  fileOrganizationId: text("file_organization_id").notNull(),
  fileId: uuid("file_id").notNull(),
  filePurpose: text("file_purpose").default("file").notNull(),
  addedByActorEntityId: uuid("added_by_actor_entity_id").notNull(),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const taskAttachments = pgTable(
  "task_attachments",
  {
    ...fields(),
    organizationId: text("organization_id").notNull(),
    taskEntityId: uuid("task_entity_id").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.organizationId, t.taskEntityId],
      foreignColumns: [tasks.organizationId, tasks.entityId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.fileOrganizationId, t.fileId, t.filePurpose],
      foreignColumns: [storedFiles.organizationId, storedFiles.id, storedFiles.purpose],
    }),
    foreignKey({
      columns: [t.fileOrganizationId, t.addedByActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    check("task_attachment_organization", sql`${t.organizationId} = ${t.fileOrganizationId}`),
    check("task_attachment_purpose", sql`${t.filePurpose} = 'file'`),
    check("task_attachment_position", sql`${t.position} >= 0`),
    unique("task_attachment_file_unique").on(t.taskEntityId, t.fileId),
    index("task_attachment_file_idx").on(t.fileId),
  ],
);
export const messageAttachments = pgTable(
  "message_attachments",
  {
    ...fields(),
    conversationId: uuid("conversation_id").notNull(),
    messageId: uuid("message_id").notNull(),
  },
  (t) => [
    foreignKey({
      name: "message_attachment_author_fk",
      columns: [t.conversationId, t.messageId, t.fileOrganizationId, t.addedByActorEntityId],
      foreignColumns: [
        messagingMessages.conversationId,
        messagingMessages.id,
        messagingMessages.authorOrganizationId,
        messagingMessages.authorActorEntityId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.fileOrganizationId, t.fileId, t.filePurpose],
      foreignColumns: [storedFiles.organizationId, storedFiles.id, storedFiles.purpose],
    }),
    foreignKey({
      columns: [t.fileOrganizationId, t.addedByActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    check("message_attachment_purpose", sql`${t.filePurpose} = 'file'`),
    check("message_attachment_position", sql`${t.position} >= 0`),
    unique("message_attachment_file_unique").on(t.messageId, t.fileId),
    index("message_attachment_file_idx").on(t.fileId),
  ],
);
