import { routineLimits } from "@substrate/contracts/agent-work";

import { idColumn } from "../../core/ids";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { agentWorkColumns, agentWorkForeignKeys } from "./provenance.schema";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const limit = (name: keyof typeof routineLimits) => sql.raw(String(routineLimits[name]));

// Scheduled unattended work. The server scheduler fires a routine only while the owner approved
// its current revision; each fire queues one routine item in the routine's session.
export const agentRoutines = pgTable(
  "agent_routines",
  {
    id: idColumn(),
    ...agentWorkColumns(),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    cron: text("cron").notNull(),
    timezone: text("timezone").notNull(),
    // Grows with each change to what the routine does or where it posts.
    revision: integer("revision").notNull().default(1),
    // The revision the owner approved. Routines the agent creates start unapproved.
    approvedRevision: integer("approved_revision"),
    destinationConversationId: uuid("destination_conversation_id").notNull(),
    destinationThreadId: uuid("destination_thread_id"),
    catchUp: text("catch_up").$type<"latest">().notNull().default("latest"),
    enabled: boolean("enabled").notNull().default(true),
    nextFireAt: timestamp("next_fire_at", { withTimezone: true }),
    lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    ...agentWorkForeignKeys(table, "agent_routines"),
    foreignKey({
      name: "agent_routines_destination_conversation_fk",
      columns: [table.destinationConversationId],
      foreignColumns: [messagingConversations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "agent_routines_destination_thread_fk",
      columns: [table.destinationConversationId, table.destinationThreadId],
      foreignColumns: [messagingMessages.conversationId, messagingMessages.id],
    }).onDelete("cascade"),
    // The scheduler's due query.
    index("agent_routines_due_idx")
      .on(table.nextFireAt)
      .where(sql`${table.enabled} AND ${table.nextFireAt} IS NOT NULL`),
    // An agent's routines: list tools and the owner's views.
    index("agent_routines_agent_idx").on(table.userAgentId, table.createdAt),
    check(
      "agent_routines_text_check",
      sql`length(trim(${table.name})) BETWEEN 1 AND ${limit("name")} AND length(trim(${table.prompt})) BETWEEN 1 AND ${limit("prompt")} AND length(${table.cron}) BETWEEN 1 AND ${limit("cron")} AND length(${table.timezone}) BETWEEN 1 AND ${limit("timezone")}`,
    ),
    check(
      "agent_routines_revision_check",
      sql`${table.revision} >= 1 AND (${table.approvedRevision} IS NULL OR ${table.approvedRevision} BETWEEN 1 AND ${table.revision})`,
    ),
  ],
);
