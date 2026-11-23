import type {
  AgentAuditAction,
  AgentInvocationDropReason,
  AgentInvocationKind,
  AgentInvocationStatus,
} from "@substrate/contracts/agent-work";
import type { AgentCallerPolicy } from "@substrate/contracts/agents";

import { actors } from "../../../core/actors/schema";
import { userAgents } from "../../../core/actors/user-agents.schema";
import { user } from "../../../core/authentication/schema";
import { messagingMessages } from "../../messaging/schema";
import { agentWakes } from "../wakes/wakes.schema";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// A person's call of someone else's agent: one per agent and message. It holds references,
// not the message body. Its wake is created when it is admitted.
export const agentInvocations = pgTable(
  "agent_invocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull(),
    userAgentId: uuid("user_agent_id").notNull(),
    agentActorEntityId: uuid("agent_actor_entity_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    callerUserId: text("caller_user_id").notNull(),
    callerActorEntityId: uuid("caller_actor_entity_id").notNull(),
    messageId: uuid("message_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    // The thread root the message replies in, or null for a top-level message.
    threadId: uuid("thread_id"),
    kind: text("kind").$type<AgentInvocationKind>().notNull(),
    // The policy and allowlist when the call arrived.
    policy: text("policy").$type<AgentCallerPolicy>().notNull(),
    allowlisted: boolean("allowlisted").notNull(),
    status: text("status").$type<AgentInvocationStatus>().notNull(),
    // Why a dropped call dropped. Null for other statuses.
    dropReason: text("drop_reason").$type<AgentInvocationDropReason>(),
    sessionKey: text("session_key").notNull(),
    // The owner who approved or declined. Null for automatic decisions.
    decidedByUserId: text("decided_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    wakeId: uuid("wake_id").references(() => agentWakes.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("agent_invocations_message_unique").on(table.userAgentId, table.messageId),
    foreignKey({
      columns: [table.ownerUserId, table.userAgentId],
      foreignColumns: [userAgents.userId, userAgents.id],
    }).onDelete("cascade"),
    // The actor is this user agent's actor, so it is an agent actor in this organization.
    foreignKey({
      name: "agent_invocations_agent_actor_fk",
      columns: [table.organizationId, table.agentActorEntityId, table.userAgentId],
      foreignColumns: [actors.organizationId, actors.entityId, actors.userAgentId],
    }).onDelete("cascade"),
    // The caller's actor is the caller's own person actor in this organization.
    foreignKey({
      name: "agent_invocations_caller_actor_fk",
      columns: [table.organizationId, table.callerActorEntityId, table.callerUserId],
      foreignColumns: [actors.organizationId, actors.entityId, actors.userId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId, table.messageId],
      foreignColumns: [messagingMessages.conversationId, messagingMessages.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId, table.threadId],
      foreignColumns: [messagingMessages.conversationId, messagingMessages.id],
    }).onDelete("cascade"),
    index("agent_invocations_owner_status_idx").on(table.ownerUserId, table.status),
    index("agent_invocations_caller_idx").on(table.userAgentId, table.callerUserId, table.status),
    index("agent_invocations_conversation_idx").on(table.conversationId, table.callerUserId),
    check("agent_invocation_caller_check", sql`${table.callerUserId} <> ${table.ownerUserId}`),
    check("agent_invocation_session_key_check", sql`length(${table.sessionKey}) BETWEEN 1 AND 200`),
  ],
);

// Append-only log of what happened to an agent's calls: policy and allowlist changes, decisions,
// and MCP calls in turns that answer callers. IDs and codes only, never message bodies.
export const agentAuditEvents = pgTable(
  "agent_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull(),
    userAgentId: uuid("user_agent_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    action: text("action").$type<AgentAuditAction>().notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    invocationId: uuid("invocation_id").references(() => agentInvocations.id, {
      onDelete: "set null",
    }),
    callerUserId: text("caller_user_id").references(() => user.id, { onDelete: "set null" }),
    tool: text("tool"),
    access: text("access").$type<"read" | "write">(),
    targetIds: jsonb("target_ids").$type<string[]>().notNull().default([]),
    result: text("result"),
    turnId: uuid("turn_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.ownerUserId, table.userAgentId],
      foreignColumns: [userAgents.userId, userAgents.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "agent_audit_events_agent_fk",
      columns: [table.organizationId, table.userAgentId],
      foreignColumns: [actors.organizationId, actors.userAgentId],
    }).onDelete("cascade"),
    index("agent_audit_events_agent_idx").on(table.userAgentId, table.createdAt),
  ],
);
