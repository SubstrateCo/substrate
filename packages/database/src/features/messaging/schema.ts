import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "../../core/authentication/schema";
import { organization } from "../../core/organizations/schema";

// Dedicated sharing boundary. These records never grant access to ordinary entities.
export const messagingConversations = pgTable(
  "messaging_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"dm" | "group" | "channel">().notNull(),
    name: text("name"),
    private: boolean("private").default(true).notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("messaging_conversation_organization_unique").on(table.organizationId, table.id),
    check("messaging_kind_check", sql`${table.kind} IN ('dm', 'group', 'channel')`),
    check("messaging_visibility_check", sql`${table.kind} = 'channel' OR ${table.private}`),
    check(
      "messaging_channel_name_check",
      sql`${table.kind} <> 'channel' OR length(trim(${table.name})) > 0 AND ${table.name} IS NOT NULL`,
    ),
  ],
);

export const messagingParticipants = pgTable(
  "messaging_participants",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => messagingConversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    // Keep authorship history after departure. The facade checks live membership on every call.
    index("messaging_participants_user_idx").on(table.userId),
  ],
);

export const messagingMessages = pgTable(
  "messaging_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => messagingConversations.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull(),
    body: text("body").notNull(),
    requestId: uuid("request_id"),
    threadId: uuid("thread_id"),
    isRoot: boolean("is_root").generatedAlwaysAs(sql`thread_id IS NULL`),
    threadRoot: boolean("thread_root").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("messaging_message_conversation_unique").on(table.conversationId, table.id),
    unique("messaging_message_request_unique").on(table.authorId, table.requestId),
    unique("messaging_message_root_unique").on(table.conversationId, table.id, table.isRoot),
    foreignKey({
      columns: [table.conversationId, table.authorId],
      foreignColumns: [messagingParticipants.conversationId, messagingParticipants.userId],
    }),
    foreignKey({
      name: "messaging_thread_root_fk",
      columns: [table.conversationId, table.threadId, table.threadRoot],
      foreignColumns: [table.conversationId, table.id, table.isRoot],
    }),
    check("messaging_thread_root_check", sql`${table.threadRoot}`),
    check("messaging_body_check", sql`length(trim(${table.body})) BETWEEN 1 AND 20000`),
    index("messaging_message_timeline_idx").on(table.conversationId, table.createdAt, table.id),
  ],
);

export const messagingReactions = pgTable(
  "messaging_reactions",
  {
    conversationId: uuid("conversation_id").notNull(),
    messageId: uuid("message_id").notNull(),
    userId: text("user_id").notNull(),
    emoji: text("emoji").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId, table.emoji] }),
    foreignKey({
      columns: [table.conversationId, table.messageId],
      foreignColumns: [messagingMessages.conversationId, messagingMessages.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId, table.userId],
      foreignColumns: [messagingParticipants.conversationId, messagingParticipants.userId],
    }),
    check("messaging_emoji_check", sql`length(trim(${table.emoji})) BETWEEN 1 AND 64`),
  ],
);
