import type { AgentSessionKind, AgentSessionStatus } from "@substrate/contracts/agent-work";
import type { HarnessKind } from "@substrate/contracts/harness";

import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Why a session's epoch is rotating. */
export type EpochRotationReason = "new_topic" | "usage" | "turns" | "policy" | "start_fresh";

/** A conversation lane mapped to one native harness session per epoch. Times are epoch ms. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    userAgentId: text("user_agent_id").notNull(),
    agentId: text("agent_id").notNull(),
    key: text("key").notNull(),
    kind: text("kind").$type<AgentSessionKind>().notNull(),
    parentSessionId: text("parent_session_id"),
    originConversationId: text("origin_conversation_id"),
    originThreadId: text("origin_thread_id"),
    destinationConversationId: text("destination_conversation_id"),
    destinationThreadId: text("destination_thread_id"),
    harness: text("harness").$type<HarnessKind>().notNull(),
    nativeSessionId: text("native_session_id"),
    epoch: integer("epoch").notNull().default(0),
    /** Turns finished in the current epoch. Rotation starts at a threshold. */
    epochTurns: integer("epoch_turns").notNull().default(0),
    /** The managed prefix of the current epoch, built once so that it stays byte-stable. */
    prefix: text("prefix"),
    /** The runtime policy version the current epoch's prefix was built with. */
    policyVersion: integer("policy_version"),
    rotation: text("rotation").$type<EpochRotationReason>(),
    status: text("status").$type<AgentSessionStatus>().notNull().default("idle"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("sessions_agent_key").on(table.userAgentId, table.key),
    // The target of composite foreign keys that keep rows in their session's organization.
    uniqueIndex("sessions_organization_id").on(table.organizationId, table.id),
    index("sessions_organization_agent").on(table.organizationId, table.userAgentId),
    index("sessions_origin_conversation").on(table.originConversationId),
    index("sessions_destination_conversation").on(table.destinationConversationId),
  ],
);
