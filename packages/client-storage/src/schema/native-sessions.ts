import type { HarnessKind } from "@substrate/contracts/harness-runtime";

import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type EpochRotationReason = "usage" | "turns" | "policy" | "workspace";

export const nativeSessions = sqliteTable(
  "native_sessions",
  {
    organizationId: text("organization_id").notNull(),
    sessionId: text("session_id").notNull(),
    userAgentId: text("user_agent_id").notNull(),
    harness: text("harness").$type<HarnessKind>().notNull(),
    nativeSessionId: text("native_session_id"),
    epoch: integer("epoch").notNull().default(0),
    epochTurns: integer("epoch_turns").notNull().default(0),
    prefix: text("prefix"),
    policyVersion: integer("policy_version"),
    /**
     * The working folder of the current epoch, fixed with its first prefix: a native session
     * resumes only in the folder it started in. Null: the agent's own folder.
     */
    workspace: text("workspace"),
    rotation: text("rotation").$type<EpochRotationReason>(),
    resetGeneration: integer("reset_generation").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.sessionId] })],
);
