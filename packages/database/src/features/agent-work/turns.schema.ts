import {
  agentActivityMaxLength,
  type TurnAttentionReason,
  type TurnInterruption,
  type TurnOutcome,
  type TurnSourceMessage,
  type TurnStatus,
} from "@substrate/contracts/agent-work";
import type { TurnKind, Usage } from "@substrate/contracts/harness-runtime";

import { desktopDevices } from "../../core/devices/schema";
import { idColumn } from "../../core/ids";
import { agentWorkColumns, agentWorkForeignKeys } from "./provenance.schema";
import { agentSessions } from "./sessions.schema";
import { sql } from "drizzle-orm";
import {
  boolean,
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

const liveStates = sql.raw(`('assigned', 'running', 'waiting', 'stopping')`);

export const agentTurns = pgTable(
  "agent_turns",
  {
    id: idColumn(),
    ...agentWorkColumns(),
    sessionId: uuid("session_id").notNull(),
    folderKey: text("folder_key").notNull(),
    kind: text("kind").$type<TurnKind>().notNull(),
    status: text("status").$type<TurnStatus>().notNull().default("assigned"),
    outcome: text("outcome").$type<TurnOutcome>(),
    attempt: integer("attempt").notNull().default(1),
    generation: integer("generation").notNull().default(1),
    handoff: boolean("handoff").notNull().default(false),
    resetGeneration: integer("reset_generation").notNull().default(0),
    error: text("error"),
    attentionReason: text("attention_reason").$type<TurnAttentionReason>(),
    interruption: text("interruption").$type<TurnInterruption>(),
    recoveries: integer("recoveries").notNull().default(0),
    autoContinue: boolean("auto_continue").notNull().default(true),
    resumesTurnId: uuid("resumes_turn_id"),
    activity: text("activity"),
    usage: jsonb("usage").$type<Usage>(),
    sourceMessages: jsonb("source_messages").$type<TurnSourceMessage[]>().notNull().default([]),
    requestAnchors: jsonb("request_anchors")
      .$type<{ requestId: string; anchorMessageId: string | null }[]>()
      .notNull()
      .default([]),
    leaseDeviceId: uuid("lease_device_id"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    ...agentWorkForeignKeys(table, "agent_turns"),
    foreignKey({
      name: "agent_turns_session_fk",
      columns: [table.organizationId, table.userAgentId, table.sessionId],
      foreignColumns: [agentSessions.organizationId, agentSessions.userAgentId, agentSessions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "agent_turns_lease_device_fk",
      columns: [table.ownerUserId, table.leaseDeviceId],
      foreignColumns: [desktopDevices.userId, desktopDevices.id],
    }),
    uniqueIndex("agent_turns_live_folder_unique")
      .on(table.folderKey)
      .where(sql`${table.status} IN ${liveStates}`),
    index("agent_turns_live_lease_idx")
      .on(table.leaseDeviceId)
      .where(sql`${table.status} IN ${liveStates}`),
    index("agent_turns_session_idx").on(table.sessionId, table.createdAt),
    index("agent_turns_agent_idx").on(table.userAgentId, table.createdAt, table.id),
    index("agent_turns_attention_idx")
      .on(table.userAgentId)
      .where(sql`${table.status} = 'needs_attention'`),
    check(
      "agent_turns_activity_check",
      sql`${table.activity} IS NULL OR length(${table.activity}) <= ${sql.raw(String(agentActivityMaxLength))}`,
    ),
    check(
      "agent_turns_counts_check",
      sql`${table.attempt} >= 1 AND ${table.generation} >= 1 AND ${table.recoveries} >= 0`,
    ),
    check(
      "agent_turns_lease_check",
      sql`(${table.leaseDeviceId} IS NULL) = (${table.leaseExpiresAt} IS NULL)`,
    ),
  ],
);
