import {
  agentRunEventKinds,
  agentRunRequestStatuses,
  agentRunStatuses,
  agentTriggerKinds,
  type AgentRunEventKind,
  type AgentRunRequestPayload,
  type AgentRunRequestResponse,
  type AgentRunRequestStatus,
  type AgentRunStatus,
  type AgentTriggerKind,
} from "@startup-os/contracts/agent-runs";

import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { desktopDevices } from "../../core/devices/schema";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const values = (list: readonly string[]) => sql.raw(list.map((value) => `'${value}'`).join(", "));

// One turn of a local agent in one thread. A trigger adds its message to the thread's queued
// run, so messages that arrive while the agent works are batched into the next turn. The agent
// reads and writes with its owner's access; runs are visible only to that owner.
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: text("organization_id").notNull(),
    agentActorEntityId: uuid("agent_actor_entity_id").notNull(),
    userAgentId: uuid("user_agent_id")
      .notNull()
      .references(() => userAgents.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => messagingConversations.id, { onDelete: "cascade" }),
    // The thread root. A top-level message starts its own thread for the agent's reply.
    threadId: uuid("thread_id").notNull(),
    triggerKind: text("trigger_kind").$type<AgentTriggerKind>().notNull(),
    status: text("status").$type<AgentRunStatus>().notNull().default("queued"),
    deviceId: uuid("device_id"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    harnessSessionId: text("harness_session_id"),
    activity: text("activity"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .default(sql`now() + interval '24 hours'`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.agentActorEntityId],
      foreignColumns: [actors.organizationId, actors.entityId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId, table.threadId],
      foreignColumns: [messagingMessages.conversationId, messagingMessages.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.ownerUserId, table.deviceId],
      foreignColumns: [desktopDevices.userId, desktopDevices.id],
    }),
    check("agent_run_status_check", sql`${table.status} IN (${values(agentRunStatuses)})`),
    check("agent_run_trigger_check", sql`${table.triggerKind} IN (${values(agentTriggerKinds)})`),
    check(
      "agent_run_lease_check",
      sql`${table.status} <> 'running' OR (${table.deviceId} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL)`,
    ),
    uniqueIndex("agent_runs_queued_thread_unique")
      .on(table.agentActorEntityId, table.threadId)
      .where(sql`${table.status} = 'queued'`),
    index("agent_runs_owner_status_idx").on(table.ownerUserId, table.status),
    index("agent_runs_conversation_idx").on(table.conversationId, table.createdAt),
    index("agent_runs_thread_idx").on(table.agentActorEntityId, table.threadId, table.createdAt),
  ],
);

// Messages a run answers. A batched run has several.
export const agentRunTriggers = pgTable(
  "agent_run_triggers",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull(),
    messageId: uuid("message_id").notNull(),
    kind: text("kind").$type<AgentTriggerKind>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.messageId] }),
    foreignKey({
      columns: [table.conversationId, table.messageId],
      foreignColumns: [messagingMessages.conversationId, messagingMessages.id],
    }).onDelete("cascade"),
    check("agent_run_trigger_kind_check", sql`${table.kind} IN (${values(agentTriggerKinds)})`),
    index("agent_run_triggers_message_idx").on(table.messageId),
  ],
);

// Approvals and questions from the harness. The waiting callback lives only in the desktop's
// harness process, so the server resolves the record first and the desktop delivers it after.
export const agentRunRequests = pgTable(
  "agent_run_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    nativeRequestId: text("native_request_id").notNull(),
    status: text("status").$type<AgentRunRequestStatus>().notNull().default("pending"),
    payload: jsonb("payload").$type<AgentRunRequestPayload>().notNull(),
    response: jsonb("response").$type<AgentRunRequestResponse>(),
    resolvedByUserId: text("resolved_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (table) => [
    unique("agent_run_requests_native_unique").on(table.runId, table.nativeRequestId),
    check(
      "agent_run_request_status_check",
      sql`${table.status} IN (${values(agentRunRequestStatuses)})`,
    ),
    check(
      "agent_run_request_response_check",
      sql`(${table.status} = 'resolved') = (${table.response} IS NOT NULL)`,
    ),
  ],
);

// The owner-only transcript: assistant text and tool activity, in order.
export const agentRunEvents = pgTable(
  "agent_run_events",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    kind: text("kind").$type<AgentRunEventKind>().notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.sequence] }),
    check("agent_run_event_kind_check", sql`${table.kind} IN (${values(agentRunEventKinds)})`),
    check("agent_run_event_text_check", sql`length(${table.text}) <= 20000`),
  ],
);
