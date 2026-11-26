import type {
  AgentSessionKind,
  AgentSessionResetReason,
  AgentSessionStatus,
} from "@substrate/contracts/agent-work";

import { idColumn } from "../../core/ids";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { agentWorkColumns, agentWorkForeignKeys } from "./provenance.schema";
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

// One rolling line of an agent's work: a DM, a thread, a routine or a helper. The host keeps the
// native session that runs it; the server keeps where it routes and when the owner reset it.
export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: idColumn(),
    ...agentWorkColumns(),
    key: text("key").notNull(),
    kind: text("kind").$type<AgentSessionKind>().notNull(),
    // A helper session's parent: the session whose turn started the helper.
    parentSessionId: uuid("parent_session_id"),
    originConversationId: uuid("origin_conversation_id"),
    originThreadId: uuid("origin_thread_id"),
    destinationConversationId: uuid("destination_conversation_id"),
    destinationThreadId: uuid("destination_thread_id"),
    status: text("status").$type<AgentSessionStatus>().notNull().default("idle"),
    resetGeneration: integer("reset_generation").notNull().default(0),
    resetReason: text("reset_reason").$type<AgentSessionResetReason>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    ...agentWorkForeignKeys(table, "agent_sessions"),
    unique("agent_sessions_agent_key_unique").on(table.userAgentId, table.key),
    // The target of composite keys that keep items, turns and helpers in their session's agent.
    unique("agent_sessions_agent_unique").on(table.organizationId, table.userAgentId, table.id),
    foreignKey({
      name: "agent_sessions_parent_fk",
      columns: [table.organizationId, table.userAgentId, table.parentSessionId],
      foreignColumns: [table.organizationId, table.userAgentId, table.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "agent_sessions_origin_conversation_fk",
      columns: [table.originConversationId],
      foreignColumns: [messagingConversations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "agent_sessions_destination_conversation_fk",
      columns: [table.destinationConversationId],
      foreignColumns: [messagingConversations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "agent_sessions_origin_thread_fk",
      columns: [table.originConversationId, table.originThreadId],
      foreignColumns: [messagingMessages.conversationId, messagingMessages.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "agent_sessions_destination_thread_fk",
      columns: [table.destinationConversationId, table.destinationThreadId],
      foreignColumns: [messagingMessages.conversationId, messagingMessages.id],
    }).onDelete("cascade"),
    // Sessions that come from or post to a conversation: the owner's conversation work.
    index("agent_sessions_origin_idx").on(table.originConversationId),
    index("agent_sessions_destination_idx").on(table.destinationConversationId),
    check("agent_sessions_key_check", sql`length(${table.key}) BETWEEN 1 AND 200`),
    check(
      "agent_sessions_parent_check",
      sql`(${table.kind} = 'helper') = (${table.parentSessionId} IS NOT NULL)`,
    ),
    check("agent_sessions_reset_check", sql`${table.resetGeneration} >= 0`),
  ],
);
