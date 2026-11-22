import { AccessDeniedError, ValidationError } from "../../errors";
import { ActorRepositories } from "../../repositories";
import { actors, entities, entityGrants } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { rootEntityValues } from "../entities/identity";
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

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
    await rejection(f.forActor(f.alice).contacts.create({ displayName: "  " }));
    expect(await f.db.select().from(entities)).toHaveLength(before.length);
    expect(await f.db.select().from(entityGrants)).toHaveLength(grantsBefore.length);
  });

  test("rolls back multiple repository operations as one transaction", async () => {
    const before = await f.db.select().from(entities);
    expect(
      await rejection(
        f.forActor(f.alice).transaction(async (tx) => {
          await tx.contacts.create({ displayName: "Rolled back" });
          throw new Error("abort");
        }),
      ),
    ).toMatchObject({ message: expect.stringContaining("abort") });
    expect(await f.db.select().from(entities)).toHaveLength(before.length);
    expect(await f.forActor(f.alice).contacts.list()).toEqual([]);
  });

  test("commits a transaction with links between its new entities", async () => {
    const { result: ids } = await f.forActor(f.alice).transaction(async (tx) => {
      const a = await tx.contacts.create({ displayName: "One" });
      const b = await tx.contacts.create({ displayName: "Two" });
      await tx.links.create({ entityId: a.entityId, otherEntityId: b.entityId });
      return [a.entityId, b.entityId];
    });
    expect(await f.forActor(f.alice).contacts.list()).toHaveLength(2);
    const [link] = await f.forActor(f.alice).links.list(ids[0]!);
    expect([link?.sourceEntityId, link?.targetEntityId]).toEqual([...ids].sort());
  });

  test("reads the profile and detail in one authorized query each, with the same access rules", async () => {
    const contact = await f.forActor(f.alice).contacts.create({ displayName: "Customer" });
    await f.forActor(f.alice).contacts.addIdentifier(contact.entityId, {
      type: "email",
      value: "customer@example.com",
    });
    const tracked = recordQueries();
    const bob = new ActorRepositories(tracked.db, { organizationId: f.orgA, actorEntityId: f.bob });
    expect(await bob.contacts.get(contact.entityId)).toMatchObject({
      entityId: contact.entityId,
      displayName: "Customer",
    });
    const getCount = tracked.queries.length;
    tracked.queries.length = 0;
    const detail = await bob.contacts.getDetail(contact.entityId);
    expect([getCount, tracked.queries.length]).toEqual([1, 4]);
    expect(detail.profile.displayName).toBe("Customer");
    expect(detail.identifiers).toMatchObject([{ value: "customer@example.com" }]);

    const missingProfile = crypto.randomUUID();
    await f.db.insert(entities).values(rootEntityValues(f.orgA, "contact", missingProfile));
    const deleted = await f.forActor(f.alice).contacts.create({ displayName: "Deleted" });
    await f.forActor(f.alice).entities.softDelete(deleted.entityId);
    const denied = [
      [f.forActor(f.outsider, f.orgB), contact.entityId],
      [f.forActor(f.alice), missingProfile],
      [f.forActor(f.alice), deleted.entityId],
      [f.forActor(f.alice), f.bob],
    ] as const;
    for (const [repos, id] of denied) {
      expect(await rejection(repos.contacts.get(id))).toBeInstanceOf(AccessDeniedError);
      expect(await rejection(repos.contacts.getDetail(id))).toBeInstanceOf(AccessDeniedError);
    }
    await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.bob));
    expect(await rejection(bob.contacts.get(contact.entityId))).toBeInstanceOf(AccessDeniedError);
    expect(await rejection(bob.contacts.getDetail(contact.entityId))).toBeInstanceOf(
      AccessDeniedError,
    );
  });

  test("pagination is bounded and ordered consistently", async () => {
    const repo = f.forActor(f.alice);
    await repo.contacts.create({ displayName: "One" });
    await repo.contacts.create({ displayName: "Two" });
    const first = await repo.contacts.list({ limit: 1 });
    const second = await repo.contacts.list({ limit: 1, afterEntityId: first[0]!.entityId });
    expect(second).toHaveLength(1);
    expect(second[0]!.entityId).not.toBe(first[0]!.entityId);
    await rejection(repo.contacts.list({ limit: 1001 }));
    expect(await rejection(repo.contacts.list({ afterEntityId: "not-a-uuid" }))).toBeInstanceOf(
      ValidationError,
    );
    expect(
      await rejection(repo.contacts.listContacts({ afterEntityId: "not-a-uuid" })),
    ).toBeInstanceOf(ValidationError);
    expect(
      await rejection(
        repo.contacts.findByIdentifier(
          { type: "email", value: "a@example.com" },
          { afterEntityId: "not-a-uuid" },
        ),
      ),
    ).toBeInstanceOf(ValidationError);
  });
});
