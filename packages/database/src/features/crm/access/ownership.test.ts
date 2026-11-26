import { setupDatabase } from "../../../testing/database";
import { rejection } from "../../../testing/rejection";
import { expect, test } from "bun:test";

const f = setupDatabase();
test("responsibility reassignment never grants access and requires an explicit restricted-owner decision", async () => {
  const a = f.forActor(f.alice);
  const account = await a.crm.createAccount({ name: "Customer" });
  const input = {
    ownerActorEntityId: f.bob,
    expectedOwnerActorEntityId: f.alice,
    accessDecision: "require_existing_access" as const,
  };
  expect(await rejection(a.crm.assignOwner(account.entityId, input))).toMatchObject({
    name: "ValidationError",
  });
  await a.crm.assignOwner(account.entityId, { ...input, accessDecision: "keep_restricted" });
  expect((await a.crm.getAccount(account.entityId)).account.ownerActorEntityId).toBe(f.bob);
  expect(await rejection(f.forActor(f.bob).crm.getAccount(account.entityId))).toMatchObject({
    name: "AccessDeniedError",
  });
  expect(await rejection(a.crm.assignOwner(account.entityId, input))).toMatchObject({
    name: "ConflictError",
  });
  expect(
    await rejection(
      a.crm.assignOwner(account.entityId, {
        ...input,
        expectedOwnerActorEntityId: f.bob,
        ownerActorEntityId: f.outsider,
      }),
    ),
  ).toMatchObject({ name: "AccessDeniedError" });
});

test("deal responsibility checks record version and accepts an already-readable human", async () => {
  const a = f.forActor(f.alice);
  const account = await a.crm.createAccount({ name: "Business" });
  const stages = await a.crm.ensurePipeline();
  const deal = await a.crm.createDeal({
    title: "Sale",
    accountEntityId: account.entityId,
    stageId: stages[0]!.id,
  });
  await a.crm.share(deal.entityId, f.bob, "view");
  const input = {
    ownerActorEntityId: f.bob,
    expectedOwnerActorEntityId: f.alice,
    expectedVersion: 1,
    accessDecision: "require_existing_access" as const,
  };
  expect(
    await rejection(a.crm.assignOwner(deal.entityId, { ...input, expectedVersion: 2 })),
  ).toMatchObject({ name: "ConflictError" });
  await a.crm.assignOwner(deal.entityId, input);
  expect((await a.crm.getDeal(deal.entityId)).deal).toMatchObject({
    ownerActorEntityId: f.bob,
    version: 2,
  });
  expect((await f.forActor(f.bob).crm.getDeal(deal.entityId)).level).toBe("view");
});

test("responsibility for an archived record cannot change until it is restored", async () => {
  const a = f.forActor(f.alice);
  const account = await a.crm.createAccount({ name: "Dormant" });
  await a.crm.archive(account.entityId, true);
  const input = {
    ownerActorEntityId: f.bob,
    expectedOwnerActorEntityId: f.alice,
    accessDecision: "keep_restricted" as const,
  };
  expect(await rejection(a.crm.assignOwner(account.entityId, input))).toMatchObject({
    name: "ValidationError",
  });
  expect((await a.crm.getAccount(account.entityId)).account.ownerActorEntityId).toBe(f.alice);
});
