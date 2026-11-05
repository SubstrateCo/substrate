/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { describe, expect, test } from "bun:test";
import { createActor } from "./provisioning";
import { actors, entities, member } from "../../schema";
import { setupDatabase } from "../../testing/database";

const f = setupDatabase();

describe("actor provisioning", () => {
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
