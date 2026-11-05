/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { describe, expect, test } from "bun:test";
import { createActor, ensureHumanActor } from "./provisioning";
import { actors, entities, member } from "../../schema";
import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";

const f = setupDatabase();

describe("actor provisioning", () => {
  test("onboarding reuses human actors without changing grants or adding entities", async () => {
    const before = await f.db.select().from(entities);
    const actor = await ensureHumanActor(f.db, {
      organizationId: f.orgA,
      userId: "alice",
      name: "Alice",
    });
    expect(actor.entityId).toBe(f.alice);
    expect(await f.db.select().from(entities)).toHaveLength(before.length);
    const privateContact = await f.forActor(f.bob).contacts.create({ displayName: "Private" });
    await expect(
      f.forActor(actor.entityId).contacts.get(privateContact.entityId),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  });

  test("concurrent onboarding provisions one actor and rolls back invalid membership", async () => {
    await f.db.insert(member).values({ id: "alice-b", organizationId: f.orgB, userId: "alice" });
    const input = { organizationId: f.orgB, userId: "alice", name: "Alice" };
    const results = await Promise.all([
      ensureHumanActor(f.db, input),
      ensureHumanActor(f.db, input),
    ]);
    expect(results[0].entityId).toBe(results[1].entityId);
    const before = await f.db.select().from(entities);
    await expect(
      ensureHumanActor(f.db, {
        organizationId: f.orgA,
        userId: "outsider",
        name: "Outsider",
      }),
    ).rejects.toThrow("membership");
    expect(await f.db.select().from(entities)).toHaveLength(before.length);
  });

  test("requires organization membership and cannot duplicate it", async () => {
    const before = await f.db.select().from(entities);
    await expect(
      createActor(f.db, {
        organizationId: f.orgA,
        type: "human",
        userId: "outsider",
        name: "Invalid",
      }),
    ).rejects.toThrow("membership");
    await expect(
      createActor(f.db, {
        organizationId: f.orgA,
        type: "human",
        userId: "alice",
        name: "Duplicate",
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
    expect(await f.db.select().from(entities)).toHaveLength(before.length);
    await f.db
      .insert(member)
      .values({ id: "alice-b", organizationId: f.orgB, userId: "alice", role: "member" });
    const actor = await createActor(f.db, {
      organizationId: f.orgB,
      type: "human",
      userId: "alice",
      name: "Alice B",
    });
    expect(actor.organizationId).toBe(f.orgB);
    expect(actor.entityId).not.toBe(f.alice);
  });

  test("database rejects invalid human and agent identity combinations", async () => {
    const [entity] = await f.db
      .insert(entities)
      .values({ organizationId: f.orgA, entityType: "actor" })
      .returning();
    const identity = { organizationId: f.orgA, entityId: entity!.entityId, name: "Invalid" };
    await expect(
      f.db
        .insert(actors)
        .values({ ...identity, type: "human" })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(
      f.db
        .insert(actors)
        .values({ ...identity, type: "agent", userId: "alice" })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(
      f.db
        .insert(actors)
        .values({ ...identity, type: "human", userId: "outsider", agentConfig: {} })
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});
