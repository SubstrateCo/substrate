import { actors } from "../../core/actors/schema";
import { contactRepository } from "../../core/contacts/repository";
import { RepositoryContext } from "../../core/repository-context";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { contactActions } from "../contacts/contact-actions";
import { listCrmActivity, recordCrmActivity } from "./activity";
import { crmActivityEvents } from "./activity.schema";
import { expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

const f = setupDatabase();
const ctx = (actorEntityId = f.alice, organizationId = f.orgA) =>
  new RepositoryContext(f.db, { organizationId, actorEntityId });
const contact = (actorEntityId = f.alice, organizationId = f.orgA) =>
  contactRepository(ctx(actorEntityId, organizationId)).create({ displayName: "Customer" });

test("human and agent attribution is distinct from responsibility and hides all private agent metadata", async () => {
  const agent = await ownedAgent(f, "alice", "Private strategy assistant");
  const target = await contact();
  await f
    .forActor(f.alice)
    .permissions.grant({ entityId: target.entityId, actorEntityId: f.bob, level: "view" });
  await recordCrmActivity(ctx(), { entityId: target.entityId, action: "created" });
  await recordCrmActivity(ctx(agent.actorId), {
    entityId: target.entityId,
    action: "updated",
    changedFields: ["notes"],
  });
  const page = await listCrmActivity(ctx(f.bob), target.entityId);
  const actorViews = page.items.map((item) => item.actor);
  expect(actorViews).toContainEqual({
    type: "human",
    displayName: "Alice",
  });
  expect(actorViews).toContainEqual({
    type: "agent",
    displayName: "Agent on behalf of Alice",
  });
  const serialized = JSON.stringify(page);
  for (const secret of [
    agent.agentId,
    agent.actorId,
    "Private strategy assistant",
    "userAgentId",
    "turn",
    "transcript",
  ])
    expect(serialized).not.toContain(secret);
  const stored = await f.db
    .select()
    .from(crmActivityEvents)
    .where(eq(crmActivityEvents.actorEntityId, agent.actorId));
  expect(stored).toHaveLength(1);
  expect(stored[0]!.actorEntityId).toBe(agent.actorId);
});

test("unreadable targets and related endpoints are denied without identifiers, names, or counts", async () => {
  const target = await contact();
  const hidden = await contact();
  await recordCrmActivity(ctx(), {
    entityId: target.entityId,
    action: "context_linked",
    relatedEntityId: hidden.entityId,
  });
  expect(await rejection(listCrmActivity(ctx(f.bob), target.entityId))).toMatchObject({
    name: "AccessDeniedError",
  });
  expect(
    await rejection(
      recordCrmActivity(ctx(f.bob), { entityId: target.entityId, action: "updated" }),
    ),
  ).toMatchObject({ name: "AccessDeniedError" });
  await f
    .forActor(f.alice)
    .permissions.grant({ entityId: target.entityId, actorEntityId: f.bob, level: "view" });
  expect(await listCrmActivity(ctx(f.bob), target.entityId, { limit: 1 })).toEqual({
    items: [],
    nextCursor: null,
  });
  await f
    .forActor(f.alice)
    .permissions.grant({ entityId: hidden.entityId, actorEntityId: f.bob, level: "view" });
  expect((await listCrmActivity(ctx(f.bob), target.entityId)).items[0]!.relatedEntityId).toBe(
    hidden.entityId,
  );
  await f.forActor(f.alice).permissions.revoke({ entityId: hidden.entityId, actorEntityId: f.bob });
  expect(await listCrmActivity(ctx(f.bob), target.entityId)).toEqual({
    items: [],
    nextCursor: null,
  });
});

test("scope is trusted, actor spoofing is rejected, and disabled actors cannot write", async () => {
  const agent = await ownedAgent(f);
  const target = await contact();
  const spoofed = { entityId: target.entityId, action: "updated" as const, actorEntityId: f.bob };
  expect(await rejection(recordCrmActivity(ctx(), spoofed))).toMatchObject({
    name: "ValidationError",
  });
  expect(
    await rejection(
      recordCrmActivity(ctx(crypto.randomUUID()), { entityId: target.entityId, action: "updated" }),
    ),
  ).toMatchObject({ name: "AccessDeniedError" });
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.bob));
  expect(
    await rejection(
      recordCrmActivity(ctx(f.bob), { entityId: target.entityId, action: "updated" }),
    ),
  ).toMatchObject({ name: "AccessDeniedError" });
  expect((await listCrmActivity(ctx(), target.entityId)).items).toHaveLength(0);
  await f.db
    .update(actors)
    .set({ disabledAt: new Date() })
    .where(eq(actors.entityId, agent.actorId));
  expect(
    await rejection(
      recordCrmActivity(ctx(agent.actorId), { entityId: target.entityId, action: "updated" }),
    ),
  ).toMatchObject({ name: "AccessDeniedError" });
});

test("tenant and target-type constraints reject invalid root, actor, and related references", async () => {
  const target = await contact();
  const foreign = await contact(f.outsider, f.orgB);
  const valid = {
    organizationId: f.orgA,
    entityId: target.entityId,
    entityType: "contact" as const,
    actorEntityId: f.alice,
    action: "updated" as const,
  };
  for (const value of [
    { ...valid, entityId: foreign.entityId },
    { ...valid, actorEntityId: f.outsider },
    { ...valid, relatedEntityId: foreign.entityId },
    { ...valid, entityType: "account" as const },
  ]) {
    expect(await rejection(f.db.insert(crmActivityEvents).values(value))).toMatchObject({
      cause: { code: "23503" },
    });
  }
  expect(
    await rejection(recordCrmActivity(ctx(), { entityId: foreign.entityId, action: "updated" })),
  ).toMatchObject({ name: "AccessDeniedError" });
  expect((await listCrmActivity(ctx(), target.entityId)).items).toHaveLength(0);
});

test("a domain failure rolls back both changed data and its activity", async () => {
  const target = await contact();
  const foreign = await contact(f.outsider, f.orgB);
  expect(
    (
      await rejection(
        ctx().transaction(async (tx) => {
          await contactRepository(tx).update(target.entityId, { notes: "This must roll back" });
          await recordCrmActivity(tx, {
            entityId: target.entityId,
            action: "updated",
            changedFields: ["notes"],
          });
          throw new Error("Later domain check failed");
        }),
      )
    ).message,
  ).toBe("Later domain check failed");
  expect((await contactRepository(ctx()).get(target.entityId)).notes).toBeNull();
  expect((await listCrmActivity(ctx(), target.entityId)).items).toHaveLength(0);
  expect(
    await rejection(
      ctx().transaction(async (tx) => {
        await contactRepository(tx).update(target.entityId, {
          notes: "Cross-organization attempt",
        });
        await recordCrmActivity(tx, {
          entityId: target.entityId,
          action: "context_linked",
          relatedEntityId: foreign.entityId,
        });
      }),
    ),
  ).toMatchObject({ name: "AccessDeniedError" });
  expect((await contactRepository(ctx()).get(target.entityId)).notes).toBeNull();
});

test("contact updates record only changed field names and concurrent retries do not duplicate history", async () => {
  const repo = contactActions(ctx());
  const target = await repo.create({ displayName: "Customer" });
  await Promise.all([
    repo.update(target.entityId, { notes: "Sensitive note" }),
    repo.update(target.entityId, { notes: "Sensitive note" }),
  ]);
  await repo.update(target.entityId, { notes: "Sensitive note" });
  await repo.update(target.entityId, {});
  const page = await listCrmActivity(ctx(), target.entityId);
  expect(page.items).toHaveLength(2);
  expect(page.items.filter((item) => item.action === "updated")).toMatchObject([
    { changedFields: ["notes"] },
  ]);
  expect(JSON.stringify(page)).not.toContain("Sensitive note");
  expect((await contactRepository(ctx()).get(target.entityId)).notes).toBe("Sensitive note");
  const badInput = {
    entityId: target.entityId,
    action: "updated" as const,
    changedFields: ["Sensitive note"],
  };
  // SAFETY: deliberately bypass the static check to test rejection at the runtime boundary.
  expect(
    await rejection(recordCrmActivity(ctx(), badInput as Parameters<typeof recordCrmActivity>[1])),
  ).toMatchObject({ name: "ValidationError" });
});

test("pagination returns every event once even with tied timestamps and more than fifty events", async () => {
  const target = await contact();
  const tied = "2026-11-12T12:34:56.123456Z";
  await f.db.insert(crmActivityEvents).values(
    Array.from({ length: 107 }, () => ({
      organizationId: f.orgA,
      entityId: target.entityId,
      entityType: "contact" as const,
      actorEntityId: f.alice,
      action: "updated" as const,
      createdAt: sql`${tied}::timestamptz`,
    })),
  );
  const first = await listCrmActivity(ctx(), target.entityId);
  expect(first.items).toHaveLength(50);
  expect(first.nextCursor).not.toBeNull();
  const second = await listCrmActivity(ctx(), target.entityId, { before: first.nextCursor! });
  const third = await listCrmActivity(ctx(), target.entityId, { before: second.nextCursor! });
  expect(second.items).toHaveLength(50);
  expect(third.items).toHaveLength(7);
  expect(third.nextCursor).toBeNull();
  const ids = [...first.items, ...second.items, ...third.items].map((item) => item.id);
  expect(new Set(ids).size).toBe(107);
  expect(ids).toEqual([...ids].sort((left, right) => right.localeCompare(left)));
  expect(first.nextCursor!.createdAt).toBe(tied);
  expect(
    await rejection(
      listCrmActivity(ctx(), target.entityId, {
        before: { createdAt: "not-a-date", id: "not-an-id" },
      }),
    ),
  ).toMatchObject({ name: "ValidationError" });
  expect(await rejection(listCrmActivity(ctx(), target.entityId, { limit: 101 }))).toMatchObject({
    name: "ValidationError",
  });
});
