import type { MailBody, MailLabel } from "@substrate/contracts/mail";

import {
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

export const mailConnections = sqliteTable(
  "mail_connections",
  {
    organizationId: text("organization_id").notNull(),
    id: text("id").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    address: text("address").notNull(),
    nickname: text("nickname"),
    protectedGrant: text("protected_grant").notNull(),
    canModify: integer("can_modify", { mode: "boolean" }).notNull().default(false),
    cursor: text("cursor"),
    labels: text("labels", { mode: "json" }).$type<MailLabel[]>().notNull().default([]),
    showLabelFilters: integer("show_label_filters", { mode: "boolean" }).notNull().default(true),
    lastSync: integer("last_sync"),
    unreadTotal: integer("unread_total"),
    status: text("status").$type<"idle" | "retry" | "reconnect">().notNull().default("idle"),
  },
  (c) => [
    primaryKey({ columns: [c.organizationId, c.id] }),
    unique().on(c.organizationId, c.provider, c.providerAccountId),
  ],
);

export const mailMessages = sqliteTable(
  "mail_messages",
  {
    organizationId: text("organization_id").notNull(),
    mailboxId: text("mailbox_id").notNull(),
    remoteId: text("remote_id").notNull(),
    id: text("id").notNull().primaryKey(),
    threadId: text("thread_id"),
    timestamp: integer("timestamp").notNull(),
    subject: text("subject").notNull(),
    from: text("from_address").notNull(),
    to: text("to_addresses").notNull(),
    snippet: text("snippet").notNull(),
    body: text("body", { mode: "json" }).$type<MailBody>().notNull(),
    flags: integer("flags").notNull(),
    labelIds: text("label_ids", { mode: "json" }).$type<string[]>().notNull(),
    scan: text("scan"),
  },
  (m) => [
    foreignKey({
      columns: [m.organizationId, m.mailboxId],
      foreignColumns: [mailConnections.organizationId, mailConnections.id],
    }).onDelete("cascade"),
    unique().on(m.organizationId, m.mailboxId, m.remoteId),
    index("mail_recent").on(m.organizationId, m.timestamp, m.id),
    index("mail_folder_counts").on(m.organizationId, m.mailboxId, m.flags, m.timestamp),
    index("mail_thread").on(m.organizationId, m.mailboxId, m.threadId, m.timestamp, m.id),
  ],
);
