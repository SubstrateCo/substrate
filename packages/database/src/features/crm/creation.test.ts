import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();

test.each([
  "human disabled",
  "human deleted",
  "human membership removed",
  "agent disabled",
  "agent deleted",
  "agent definition disabled",
  "agent definition deleted",
  "owner disabled",
  "owner deleted",
  "owner membership removed",
])("CRM creation and mismatched replay deny an inactive %s", async (state) => {
  const agent = await ownedAgent(f);
  const actorId = state.startsWith("human") ? f.alice : agent.actorId;
  const a = f.forActor(actorId);
  const accountInput = { name: "Customer", requestId: crypto.randomUUID() };
  const account = await a.crm.createAccount(accountInput);
  const [stage] = await f.forActor(f.alice).crm.ensurePipeline();
  const dealInput = {
    title: "Sale",
    accountEntityId: account.entityId,
    stageId: stage!.id,
    requestId: crypto.randomUUID(),
  };
  const deal = await a.crm.createDeal(dealInput);
  expect(account.ownerActorEntityId).toBe(f.alice);
  expect(deal.ownerActorEntityId).toBe(f.alice);
  expect(await rejection(a.crm.createDeal({ ...dealInput, title: "Changed" }))).toMatchObject({
    name: "ConflictError",
  });
  if (state.includes("membership"))
    await f.db
      .delete(member)
      .where(and(eq(member.organizationId, f.orgA), eq(member.userId, "alice")));
  else if (state.includes("definition"))
    await f.db
      .update(userAgents)
      .set(state.endsWith("disabled") ? { enabled: false } : { deletedAt: new Date() })
      .where(eq(userAgents.id, agent.agentId));
  else {
    const target = state.startsWith("agent") ? agent.actorId : f.alice;
    if (state.endsWith("disabled"))
      await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, target));
    else
      await f.db
        .update(entities)
        .set({ deletedAt: new Date() })
        .where(eq(entities.entityId, target));
  }
  for (const attempt of [
    () => a.crm.createAccount({ name: "New" }),
    () => a.crm.createDeal({ title: "New", stageId: stage!.id, accountEntityId: account.entityId }),
    () => a.crm.createAccount({ ...accountInput, name: "Changed" }),
    () => a.crm.createDeal({ ...dealInput, title: "Changed" }),
  ])
    expect(await rejection(attempt())).toMatchObject({ name: "AccessDeniedError" });
});

test("account and deal creation requests dedupe concurrent delivery and reject changed content", async () => {
  const a = f.forActor(f.alice);
  const input = { name: "Customer", requestId: crypto.randomUUID() };
  const [first, second] = await Promise.all([
    a.crm.createAccount(input),
    a.crm.createAccount(input),
  ]);
  expect(first.entityId).toBe(second.entityId);
  expect(await rejection(a.crm.createAccount({ ...input, name: "Changed" }))).toMatchObject({
    name: "ConflictError",
  });
  const stages = await a.crm.ensurePipeline();
  const dealInput = {
    title: "Sale",
    accountEntityId: first.entityId,
    stageId: stages[0]!.id,
    requestId: crypto.randomUUID(),
  };
  const [deal, replay] = await Promise.all([
    a.crm.createDeal(dealInput),
    a.crm.createDeal(dealInput),
  ]);
  expect(deal.entityId).toBe(replay.entityId);
  expect(await a.crm.listDeals()).toHaveLength(1);
  await a.entities.softDelete(first.entityId);
  expect(await rejection(a.crm.createAccount(input))).toMatchObject({ name: "AccessDeniedError" });
  expect((await a.crm.createDeal(dealInput)).accountEntityId).toBeNull();
  expect(await a.crm.listAccounts()).toEqual([]);
});
