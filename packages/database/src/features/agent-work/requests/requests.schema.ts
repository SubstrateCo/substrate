import type {
  AgentRequestKind,
  AgentRequestMode,
  AgentRequestPayload,
  AgentRequestResponse,
  AgentRequestStatus,
  ProposalAction,
  ProposalOutcome,
  ProposalTargetBasis,
} from "@substrate/contracts/agent-work";

import { actors } from "../../../core/actors/schema";
import { userAgents } from "../../../core/actors/user-agents.schema";
import { user } from "../../../core/authentication/schema";
import { idColumn } from "../../../core/ids";
import { messagingConversations, messagingMessages } from "../../messaging/schema";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const agentRequests = pgTable(
  "agent_requests",
  {
    id: idColumn(),
    organizationId: text("organization_id").notNull(),
    userAgentId: uuid("user_agent_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    agentActorEntityId: uuid("agent_actor_entity_id").notNull(),
    sessionKey: text("session_key").notNull(),
    turnId: uuid("turn_id").notNull(),
    epoch: integer("epoch"),
    kind: text("kind").$type<AgentRequestKind>().notNull(),
    mode: text("mode").$type<AgentRequestMode>().notNull(),
    nativeRequestId: text("native_request_id"),
    anchorMessageId: uuid("anchor_message_id"),
    conversationId: uuid("conversation_id").references(() => messagingConversations.id, {
      onDelete: "cascade",
    }),
    threadId: uuid("thread_id"),
    payload: jsonb("payload").$type<AgentRequestPayload>().notNull(),
    proposedAction: jsonb("proposed_action").$type<ProposalAction>(),
    actionHash: text("action_hash"),
    targetBasis: jsonb("target_basis").$type<ProposalTargetBasis>(),
    response: jsonb("response").$type<AgentRequestResponse>(),
    outcome: jsonb("outcome").$type<ProposalOutcome>(),
    status: text("status").$type<AgentRequestStatus>().notNull().default("pending"),
    resolvedByUserId: text("resolved_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.ownerUserId, table.userAgentId],
      foreignColumns: [userAgents.userId, userAgents.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.organizationId, table.agentActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }).onDelete("cascade"),
    foreignKey({
      name: "agent_requests_agent_actor_fk",
      columns: [table.organizationId, table.agentActorEntityId, table.userAgentId],
      foreignColumns: [actors.organizationId, actors.entityId, actors.userAgentId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId, table.anchorMessageId],
      foreignColumns: [messagingMessages.conversationId, messagingMessages.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId, table.threadId],
      foreignColumns: [messagingMessages.conversationId, messagingMessages.id],
    }).onDelete("cascade"),
    uniqueIndex("agent_requests_native_unique")
      .on(table.userAgentId, table.turnId, table.nativeRequestId)
      .where(sql`${table.nativeRequestId} IS NOT NULL`),
    index("agent_requests_owner_status_idx").on(table.ownerUserId, table.status),
    index("agent_requests_conversation_idx").on(table.conversationId, table.createdAt),
    index("agent_requests_turn_idx").on(table.turnId),
    check(
      "agent_request_blocking_check",
      sql`${table.mode} <> 'blocking' OR ${table.nativeRequestId} IS NOT NULL`,
    ),
    check(
      "agent_request_proposal_check",
      sql`(${table.kind} = 'proposal') = (${table.proposedAction} IS NOT NULL AND ${table.actionHash} IS NOT NULL) AND (${table.kind} <> 'proposal' OR ${table.mode} = 'async')`,
    ),
    check(
      "agent_request_place_check",
      sql`${table.conversationId} IS NOT NULL OR (${table.anchorMessageId} IS NULL AND ${table.threadId} IS NULL)`,
    ),
    check("agent_request_session_key_check", sql`length(${table.sessionKey}) BETWEEN 1 AND 200`),
  ],
);
