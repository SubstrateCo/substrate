import { agentTriggerKinds, type AgentTriggerKind } from "@substrate/contracts/agents";

import { userAgents } from "../../core/actors/user-agents.schema";
import { checkValues } from "../agent-work/check-values";
import { sql } from "drizzle-orm";
import { boolean, check, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Owner overrides for the code-defined triggers. A missing row means enabled.
export const userAgentTriggers = pgTable(
  "user_agent_triggers",
  {
    userAgentId: uuid("user_agent_id")
      .notNull()
      .references(() => userAgents.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AgentTriggerKind>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userAgentId, table.kind] }),
    check(
      "user_agent_trigger_kind_check",
      sql`${table.kind} IN (${checkValues(agentTriggerKinds)})`,
    ),
  ],
);
