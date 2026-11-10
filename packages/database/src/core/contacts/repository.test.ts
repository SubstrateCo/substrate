import { entities, entityGrants } from "../../schema";
import { setupDatabase } from "../../testing/database";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { describe, expect, test } from "bun:test";

const f = setupDatabase();

describe("contacts and transactions", () => {
  test("creates a typed contact, registry record, and owner access together", async () => {
    const repo = f.forActor(f.alice);
    const contact = await repo.contacts.create({ displayName: "Customer" });
    expect(contact.organizationId).toBe(f.orgA);
    expect((await repo.entities.get(contact.entityId)).entityType).toBe("contact");
    expect(await f.accessLevel(f.alice, contact.entityId)).toBe("owner");
    expect((await repo.contacts.get(contact.entityId)).displayName).toBe("Customer");
  });

  test("does not let caller-supplied extra properties override trusted fields", async () => {
    const input = {
      displayName: "Customer",
      organizationId: f.orgB,
      entityId: crypto.randomUUID(),
    };
    const contact = await f.forActor(f.alice).contacts.create(input);
    expect(contact.organizationId).toBe(f.orgA);
    expect(contact.entityId).not.toBe(input.entityId);
  });

  test("rejects blank names without leaving an orphan entity or grant", async () => {
    const before = await f.db.select().from(entities);
    const grantsBefore = await f.db.select().from(entityGrants);
    await expect(f.forActor(f.alice).contacts.create({ displayName: "  " })).rejects.toThrow();
    expect(await f.db.select().from(entities)).toHaveLength(before.length);
    expect(await f.db.select().from(entityGrants)).toHaveLength(grantsBefore.length);
  });

  test("rolls back multiple repository operations as one transaction", async () => {
    const before = await f.db.select().from(entities);
    await expect(
      f.forActor(f.alice).transaction(async (tx) => {
        await tx.contacts.create({ displayName: "Rolled back" });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await f.db.select().from(entities)).toHaveLength(before.length);
    expect(await f.forActor(f.alice).contacts.list()).toEqual([]);
  });

  test("commits a transaction with links between its new entities", async () => {
    const ids = await f.forActor(f.alice).transaction(async (tx) => {
      const a = await tx.contacts.create({ displayName: "One" });
      const b = await tx.contacts.create({ displayName: "Two" });
      await tx.links.create({
        sourceEntityId: a.entityId,
        targetEntityId: b.entityId,
        relationType: "related_to",
      });
      return [a.entityId, b.entityId];
    });
    expect(await f.forActor(f.alice).contacts.list()).toHaveLength(2);
    expect((await f.forActor(f.alice).links.list(ids[0]!))[0]?.targetEntityId).toBe(ids[1]);
  });

  test("pagination is bounded and ordered consistently", async () => {
    const repo = f.forActor(f.alice);
    await repo.contacts.create({ displayName: "One" });
    await repo.contacts.create({ displayName: "Two" });
    const first = await repo.contacts.list({ limit: 1 });
    const second = await repo.contacts.list({ limit: 1, afterEntityId: first[0]!.entityId });
    expect(second).toHaveLength(1);
    expect(second[0]!.entityId).not.toBe(first[0]!.entityId);
    await expect(repo.contacts.list({ limit: 1001 })).rejects.toThrow();
  });
});
