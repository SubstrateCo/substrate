import { agentAuditEvents, userAgents } from "../../schema";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { saveCallerPolicy } from "../agent-work/committed";
import { expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";

const f = setupDatabase();

test("concurrent policy changes audit a consistent old and new policy chain", async () => {
  const agent = await ownedAgent(f);
  const owner = { userId: "alice", organizationId: f.orgA };
  let changes!: Promise<unknown[]>;
  await f.db.transaction(async (tx) => {
    await tx
      .select({ id: userAgents.id })
      .from(userAgents)
      .where(eq(userAgents.id, agent.agentId))
      .for("no key update");
    changes = Promise.all([
      saveCallerPolicy(f.db, owner, agent.agentId, "ask"),
      saveCallerPolicy(f.db, owner, agent.agentId, "anyone"),
    ]);
    // Both changes reach the blocked UPDATE with the same old policy.
    for (let attempt = 0; ; attempt++) {
      const [row] = await f.db.execute<{ n: number }>(
        sql`select count(*)::int as n from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
      );
      if (row!.n >= 2) break;
      if (attempt >= 100) throw new Error("Policy changes did not reach the row lock.");
      await Bun.sleep(25);
    }
  });
  await changes;
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
