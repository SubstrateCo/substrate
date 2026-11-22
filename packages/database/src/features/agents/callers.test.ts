import { agentAuditEvents, userAgents } from "../../schema";
import { ownerAgentWork } from "../../testing/agent-work";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();

test("concurrent policy changes audit a consistent old and new policy chain", async () => {
  const agent = await ownedAgent(f);
  const owner = { userId: "alice", organizationId: f.orgA };
  const agentWork = await ownerAgentWork(f.db, owner);
  await Promise.all([
    agentWork.saveCallerPolicy(agent.agentId, "ask"),
    agentWork.saveCallerPolicy(agent.agentId, "anyone"),
  ]);
  const rows = await f.db
    .select({ policies: agentAuditEvents.targetIds })
    .from(agentAuditEvents)
    .where(
      and(
        eq(agentAuditEvents.userAgentId, agent.agentId),
        eq(agentAuditEvents.action, "policy_changed"),
      ),
    );
  expect(rows).toHaveLength(2);
  const first = rows.find((row) => row.policies[0] === "owner")!;
  expect(first.policies[1]).toMatch(/^(ask|anyone)$/);
  const second = rows.find((row) => row !== first)!;
  expect(second.policies[0]).toBe(first.policies[1]);
  expect(second.policies[1]).toBe(first.policies[1] === "ask" ? "anyone" : "ask");
  const [saved] = await f.db
    .select({ policy: userAgents.callerPolicy })
    .from(userAgents)
    .where(eq(userAgents.id, agent.agentId));
  expect(second.policies[1]).toBe(saved!.policy);
});
