import {
  maxAdmittedInvocationsPerDay,
  maxPendingInvocationsPerCaller,
} from "@substrate/contracts/agent-work";

import { callerFixture } from "../../../testing/agent-work";
import { ownedAgent } from "../../../testing/agents";
import { setupDatabase } from "../../../testing/database";
import { recordQueries } from "../../../testing/queries";
import { messagingMessages } from "../../messaging/schema";
import { createMessagingService } from "../../messaging/service";
import { agentInvocations } from "../calls/invocations.schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

interface ExplainNode {
  "Node Type": string;
  "Actual Rows": number;
  Plans?: ExplainNode[];
}

for (const [pending, daily] of [
  [2, 99],
  [3, 99],
  [2, 100],
  [3, 100],
  [7, 120],
] as const)
  test(`caller facts bound qualifying counts at pending ${pending} and daily ${daily}`, async () => {
    const x = await callerFixture(f);
    await x.policy("ask");
    const recorded = recordQueries();
    const bob = createMessagingService(recorded.db, { userId: "bob", organizationId: f.orgA });
    const first = await bob.sendMessage(x.channel.id, x.mention);
    const [template] = await f.db
      .select()
      .from(agentInvocations)
      .where(eq(agentInvocations.messageId, first.id));
    const other = await ownedAgent(f, "carol");
    const rows: (typeof agentInvocations.$inferInsert)[] = [];
    const add = (n: number, overrides: Partial<typeof agentInvocations.$inferInsert> = {}) => {
      for (let i = 0; i < n; i++)
        rows.push({ ...template!, id: crypto.randomUUID(), ...overrides });
    };
    add(pending - 1);
    add(daily - 2, { status: "admitted", decidedAt: new Date() });
    add(1, { status: "dropped", decidedAt: new Date(), dropReason: "revoked" });
    add(1, {
      status: "admitted",
      decidedAt: new Date(),
      callerUserId: "carol",
      callerActorEntityId: x.carolActorId,
      expiresAt: new Date(Date.now() - 60_000),
    });
    // None of these qualify for Bob's live pending count or this agent's daily count.
    add(5, { expiresAt: new Date(Date.now() - 60_000) });
    add(5, { callerUserId: "carol", callerActorEntityId: x.carolActorId });
    add(5, {
      userAgentId: other.agentId,
      agentActorEntityId: other.actorId,
      ownerUserId: "carol",
    });
    add(5, {
      userAgentId: other.agentId,
      agentActorEntityId: other.actorId,
      ownerUserId: "carol",
      status: "admitted",
      decidedAt: new Date(),
    });
    add(5, { status: "admitted", decidedAt: new Date(Date.now() - 2 * 86_400_000) });
    add(5, { status: "admitted", decidedAt: null });
    add(5, { status: "declined", decidedAt: new Date() });
    const messages = await f.db
      .insert(messagingMessages)
      .values(
        rows.map(() => ({
          conversationId: x.channel.id,
          authorActorEntityId: f.bob,
          authorOrganizationId: f.orgA,
          body: "Earlier call",
        })),
      )
      .returning({ id: messagingMessages.id });
    await f.db
      .insert(agentInvocations)
      .values(rows.map((row, i) => ({ ...row, messageId: messages[i]!.id })));

    const index = recorded.queries.findIndex(
      (query) => query.startsWith("select ") && query.includes('"user_agent_callers"'),
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const query = recorded.queries[index]!;
    // SAFETY: replay the parameters captured for this exact statement.
    const parameters = recorded.parameters[index] as never[];
    const facts = await f.db.$client.unsafe(query, parameters).values();
    expect(facts.map((row) => [row[0], row[3], row[4]])).toEqual([
      [
        x.agent.agentId,
        Math.min(pending, maxPendingInvocationsPerCaller),
        Math.min(daily, maxAdmittedInvocationsPerDay),
      ],
    ]);
    if (pending > maxPendingInvocationsPerCaller) {
      const plan = await f.db.$client.unsafe<{ "QUERY PLAN": { Plan: ExplainNode }[] }[]>(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
        parameters,
      );
      const limits: number[] = [];
      const visit = (node: ExplainNode) => {
        if (node["Node Type"] === "Limit") limits.push(node["Actual Rows"]);
        node.Plans?.forEach(visit);
      };
      visit(plan[0]!["QUERY PLAN"][0]!.Plan);
      expect(limits.sort((a, b) => a - b)).toEqual([
        maxPendingInvocationsPerCaller,
        maxAdmittedInvocationsPerDay,
      ]);
    }
    const next = await bob.sendMessage(x.channel.id, x.mention);
    expect(
      await f.db
        .select({ status: agentInvocations.status })
        .from(agentInvocations)
        .where(eq(agentInvocations.messageId, next.id)),
    ).toEqual([
      {
        status: pending >= maxPendingInvocationsPerCaller ? "rate_limited" : "pending_approval",
      },
    ]);
    await x.policy("anyone");
    const automatic = await bob.sendMessage(x.channel.id, x.mention);
    expect(
      await f.db
        .select({ status: agentInvocations.status })
        .from(agentInvocations)
        .where(eq(agentInvocations.messageId, automatic.id)),
    ).toEqual([{ status: daily >= maxAdmittedInvocationsPerDay ? "rate_limited" : "admitted" }]);
  });
