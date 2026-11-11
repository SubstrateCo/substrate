import { actors, actorType } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { organization } from "../../core/organizations/schema";
import { searchDocument, trigramKey } from "../../core/search/indexing";
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
    index("messaging_conversations_name_trgm_idx").using(
      "gin",
      sql`${trigramKey(table.name)} gin_trgm_ops`,
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
    // Existing external participants stay unapproved until they accept a new invitation.
    consentedAt: timestamp("consented_at", { withTimezone: true }),
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
    // A person's user is the author actor's user_id. Membership is checked through that actor.
    authorActorEntityId: uuid("author_actor_entity_id").notNull(),
    authorOrganizationId: text("author_organization_id").notNull(),
    body: text("body").notNull(),
    requestId: uuid("request_id"),
    threadId: uuid("thread_id"),
    isRoot: boolean("is_root").generatedAlwaysAs(sql`thread_id IS NULL`),
    threadRoot: boolean("thread_root").default(true).notNull(),
    // The local agent turn that published this reply. Provenance only; it grants no access.
    originTurnId: uuid("origin_turn_id"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("messaging_message_conversation_unique").on(table.conversationId, table.id),
    unique("messaging_message_author_unique").on(
      table.conversationId,
      table.id,
      table.authorOrganizationId,
      table.authorActorEntityId,
    ),
    unique("messaging_actor_message_request_unique").on(table.authorActorEntityId, table.requestId),
    foreignKey({
      columns: [table.authorOrganizationId, table.authorActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }),
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
    check("messaging_body_check", sql`length(${table.body}) <= 20000`),
    check("messaging_deleted_body_check", sql`${table.deletedAt} IS NULL OR ${table.body} = ''`),
    // Message search matches words and word prefixes, not substrings inside words.
    index("messaging_messages_search_idx").using("gin", searchDocument(table.body)),
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
    // A conversation's latest activity, which does not filter by thread.
    index("messaging_message_conversation_created_idx").on(table.conversationId, table.createdAt),
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
    // The participant foreign key on participant removal.
    index("messaging_reactions_participant_idx").on(table.conversationId, table.actorEntityId),
  ],
);
