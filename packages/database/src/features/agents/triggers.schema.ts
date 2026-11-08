import { agentTriggerKinds, type AgentTriggerKind } from "@startup-os/contracts/agent-runs";

import { userAgents } from "../../core/actors/user-agents.schema";
import { sql } from "drizzle-orm";
import { boolean, check, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

const kinds = sql.raw(agentTriggerKinds.map((kind) => `'${kind}'`).join(", "));

// Owner overrides for the code-defined triggers. A missing row means enabled with the default prompt.
export const userAgentTriggers = pgTable(
  "user_agent_triggers",
  {
    userAgentId: uuid("user_agent_id")
      .notNull()
      .references(() => userAgents.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AgentTriggerKind>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    prompt: text("prompt"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userAgentId, table.kind] }),
    check("user_agent_trigger_kind_check", sql`${table.kind} IN (${kinds})`),
    check(
      "user_agent_trigger_prompt_check",
      sql`${table.prompt} IS NULL OR length(trim(${table.prompt})) BETWEEN 1 AND 20000`,
    ),
  ],
);
