import { actors, actorType } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { organization } from "../../core/organizations/schema";
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

// People and agents are members through their actor. The actor's organization is the member's
// organization, so partner members keep their own workspace identity. An agent's membership makes
// it addressable in the conversation; it reads with its owner's access, never through this row.
export const messagingParticipants = pgTable(
  "messaging_participants",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => messagingConversations.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id),
    actorEntityId: uuid("actor_entity_id").notNull(),
    actorType: actorType("actor_type").notNull(),
    // Set when the member leaves. The row stays because messages and reactions reference it.
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.actorEntityId] }),
    foreignKey({
      columns: [table.organizationId, table.actorEntityId, table.actorType],
      foreignColumns: [actors.organizationId, actors.entityId, actors.type],
    }),
    // Keep authorship history after departure. The facade checks live membership on every call.
    index("messaging_participants_actor_idx").on(table.actorEntityId),
  ],
);

export const messagingMessages = pgTable(
  "messaging_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => messagingConversations.id, { onDelete: "cascade" }),
    authorId: text("author_id"),
    // A person also keeps author_id. Membership is checked through the author's actor.
    authorActorEntityId: uuid("author_actor_entity_id").notNull(),
    authorOrganizationId: text("author_organization_id").notNull(),
    body: text("body").notNull(),
    requestId: uuid("request_id"),
    threadId: uuid("thread_id"),
    isRoot: boolean("is_root").generatedAlwaysAs(sql`thread_id IS NULL`),
    threadRoot: boolean("thread_root").default(true).notNull(),
    // The local agent turn that published this reply. Provenance only; it grants no access.
    originTurnId: uuid("origin_turn_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("messaging_message_conversation_unique").on(table.conversationId, table.id),
    unique("messaging_message_request_unique").on(table.authorId, table.requestId),
    unique("messaging_actor_message_request_unique").on(table.authorActorEntityId, table.requestId),
    foreignKey({
      columns: [table.authorOrganizationId, table.authorActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
    check(
      "messaging_author_check",
      sql`(${table.authorId} IS NOT NULL OR ${table.authorActorEntityId} IS NOT NULL) AND ((${table.authorActorEntityId} IS NULL) = (${table.authorOrganizationId} IS NULL))`,
    ),
    unique("messaging_message_root_unique").on(table.conversationId, table.id, table.isRoot),
    foreignKey({
      columns: [table.conversationId, table.authorActorEntityId],
      foreignColumns: [messagingParticipants.conversationId, messagingParticipants.actorEntityId],
    }),
    foreignKey({
      name: "messaging_thread_root_fk",
      columns: [table.conversationId, table.threadId, table.threadRoot],
      foreignColumns: [table.conversationId, table.id, table.isRoot],
    }),
    check("messaging_thread_root_check", sql`${table.threadRoot}`),
    check("messaging_body_check", sql`length(trim(${table.body})) BETWEEN 1 AND 20000`),
    index("messaging_message_timeline_idx").on(table.conversationId, table.createdAt, table.id),
    // Root and thread pages, and the thread root foreign key on root deletion.
    index("messaging_message_thread_idx").on(
      table.conversationId,
      table.threadId,
      table.createdAt,
      table.id,
    ),
    index("messaging_message_origin_turn_idx")
      .on(table.originTurnId)
      .where(sql`${table.originTurnId} IS NOT NULL`),
  ],
);

export const messagingReactions = pgTable(
  "messaging_reactions",
  {
    conversationId: uuid("conversation_id").notNull(),
    messageId: uuid("message_id").notNull(),
    actorEntityId: uuid("actor_entity_id").notNull(),
    emoji: text("emoji").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.actorEntityId, table.emoji] }),
    foreignKey({
      columns: [table.conversationId, table.messageId],
      foreignColumns: [messagingMessages.conversationId, messagingMessages.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId, table.actorEntityId],
      foreignColumns: [messagingParticipants.conversationId, messagingParticipants.actorEntityId],
    }),
    check("messaging_emoji_check", sql`length(trim(${table.emoji})) BETWEEN 1 AND 64`),
  ],
);
