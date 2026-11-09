import {
  agentActivityMaxLength,
  agentStatusStates,
  type AgentStatusState,
} from "@startup-os/contracts/agent-work";

import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { organization } from "../../core/organizations/schema";
import { messagingConversations, messagingMessages } from "../messaging/schema";
import { checkValues } from "./check-values";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// What the agent's home desktop last published. Owner-only; the server keeps the newest version.
export const agentStatus = pgTable(
  "agent_status",
  {
    userAgentId: uuid("user_agent_id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id").notNull(),
    state: text("state").$type<AgentStatusState>().notNull(),
    queuedCount: integer("queued_count").notNull().default(0),
    // Deleting the conversation deletes the row, so no activity outlives its place. The home
    // desktop publishes a new row.
    liveConversationId: uuid("live_conversation_id").references(() => messagingConversations.id, {
      onDelete: "cascade",
    }),
    liveThreadId: uuid("live_thread_id"),
    activity: text("activity"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    // Milliseconds since the epoch from the desktop clock, so a restart never goes backwards.
    version: bigint("version", { mode: "number" }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.ownerUserId, table.userAgentId],
      foreignColumns: [userAgents.userId, userAgents.id],
    }).onDelete("cascade"),
    // The agent has its actor in this organization.
    foreignKey({
      name: "agent_status_agent_actor_fk",
      columns: [table.organizationId, table.userAgentId],
      foreignColumns: [actors.organizationId, actors.userAgentId],
    }).onDelete("cascade"),
    foreignKey({
      name: "agent_status_live_thread_fk",
      columns: [table.liveConversationId, table.liveThreadId],
      foreignColumns: [messagingMessages.conversationId, messagingMessages.id],
    }).onDelete("cascade"),
    check(
      "agent_status_live_place_check",
      sql`${table.liveThreadId} IS NULL OR ${table.liveConversationId} IS NOT NULL`,
    ),
    check("agent_status_state_check", sql`${table.state} IN (${checkValues(agentStatusStates)})`),
    check(
      "agent_status_activity_check",
      sql`${table.activity} IS NULL OR length(${table.activity}) <= ${sql.raw(String(agentActivityMaxLength))}`,
    ),
    check("agent_status_queued_check", sql`${table.queuedCount} >= 0`),
  ],
);
