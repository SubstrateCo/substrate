import type { HarnessKind } from "@substrate/contracts/harness-runtime";

import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Why a session's epoch is rotating. */
export type EpochRotationReason = "usage" | "turns" | "policy";

/**
 * The native harness session of a server session on this host, one per epoch. The server owns
 * the session itself; this row holds only what the host needs to resume it. Times are epoch ms.
 */
export const nativeSessions = sqliteTable(
  "native_sessions",
  {
    organizationId: text("organization_id").notNull(),
    /** The server session ID. */
    sessionId: text("session_id").notNull(),
    /** The owner's agent, which also names the agent folder. */
    userAgentId: text("user_agent_id").notNull(),
    harness: text("harness").$type<HarnessKind>().notNull(),
    nativeSessionId: text("native_session_id"),
    epoch: integer("epoch").notNull().default(0),
    /** Turns finished in the current epoch. Rotation starts at a threshold. */
    epochTurns: integer("epoch_turns").notNull().default(0),
    /** The managed prefix of the current epoch, built once so that it stays byte-stable. */
    prefix: text("prefix"),
    /** The runtime policy version the current epoch's prefix was built with. */
    policyVersion: integer("policy_version"),
    /** Set while the epoch's handoff item waits on the server. */
    rotation: text("rotation").$type<EpochRotationReason>(),
    /** The server reset generation that the current epoch started after. */
    resetGeneration: integer("reset_generation").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.sessionId] })],
);
