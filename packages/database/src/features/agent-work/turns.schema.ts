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

/** The SQL list of live turn states, for partial indexes. Matches liveTurnStatuses. */
const liveStates = sql.raw(`('assigned', 'running', 'waiting', 'stopping')`);

// One execution of a batch of work items in one session. The host that holds the lease runs it
// and reports its lifecycle; its transcript stays on that host.
export const agentTurns = pgTable(
  "agent_turns",
  {
    id: idColumn(),
    ...agentWorkColumns(),
    sessionId: uuid("session_id").notNull(),
    // One live turn per folder: main:<userAgentId> or helper:<helperId>.
    folderKey: text("folder_key").notNull(),
    kind: text("kind").$type<TurnKind>().notNull(),
    status: text("status").$type<TurnStatus>().notNull().default("assigned"),
    outcome: text("outcome").$type<TurnOutcome>(),
    attempt: integer("attempt").notNull().default(1),
    generation: integer("generation").notNull().default(1),
    // The epoch handoff turn of its session: it runs its epoch item alone and must not publish.
    handoff: boolean("handoff").notNull().default(false),
    // The session's reset generation the turn runs in. Input does not steer into a turn whose
    // session the owner reset since.
    resetGeneration: integer("reset_generation").notNull().default(0),
    error: text("error"),
    attentionReason: text("attention_reason").$type<TurnAttentionReason>(),
    interruption: text("interruption").$type<TurnInterruption>(),
    // Automatic continues after the host lost the harness. It continues at most once.
    recoveries: integer("recoveries").notNull().default(0),
    autoContinue: boolean("auto_continue").notNull().default(true),
    resumesTurnId: uuid("resumes_turn_id"),
    activity: text("activity"),
    usage: jsonb("usage").$type<Usage>(),
    // Placement: the visible source messages, and the anchors of the requests it answers.
    sourceMessages: jsonb("source_messages").$type<TurnSourceMessage[]>().notNull().default([]),
    requestAnchors: jsonb("request_anchors")
      .$type<{ requestId: string; anchorMessageId: string | null }[]>()
      .notNull()
      .default([]),
    // The host device that runs the turn, until the lease expires or the turn ends.
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
    // Only a device of the agent's owner holds the lease.
    foreignKey({
      name: "agent_turns_lease_device_fk",
      columns: [table.ownerUserId, table.leaseDeviceId],
      foreignColumns: [desktopDevices.userId, desktopDevices.id],
    }),
    // A claim inserts a turn only into a free folder, so concurrent claims cannot share one.
    uniqueIndex("agent_turns_live_folder_unique")
      .on(table.folderKey)
      .where(sql`${table.status} IN ${liveStates}`),
    // Live turns per device: claim capacity, sync, lease renewal and expiry.
    index("agent_turns_live_lease_idx")
      .on(table.leaseDeviceId)
      .where(sql`${table.status} IN ${liveStates}`),
    // Turns of a session, newest first: finish, claim blocking and the owner's views.
    index("agent_turns_session_idx").on(table.sessionId, table.createdAt),
    // An agent's turns, newest first: the owner's activity pages.
    index("agent_turns_agent_idx").on(table.userAgentId, table.createdAt, table.id),
    // Turns that wait for the owner, per agent: status and needs-you.
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
