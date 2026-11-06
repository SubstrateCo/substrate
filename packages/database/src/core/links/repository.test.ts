/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { describe, expect, test } from "bun:test";
import { AccessDeniedError } from "../../index";
import { setupDatabase } from "../../testing/database";

const f = setupDatabase();

describe("links", () => {
  test("links do not grant access or reveal inaccessible targets", async () => {
    const repo = f.forActor(f.alice);
    const shared = await repo.contacts.create({ displayName: "Shared" });
    const privateContact = await repo.contacts.create({ displayName: "Private" });
    await repo.links.create({
      sourceEntityId: shared.entityId,
      targetEntityId: privateContact.entityId,
      relationType: "related_to",
    });
    await repo.permissions.grant({
      entityId: shared.entityId,
      actorEntityId: f.bob,
      level: "edit",
    });
    expect(await f.forActor(f.bob).links.list(shared.entityId)).toEqual([]);
    await expect(
      f.forActor(f.bob).links.create({
        sourceEntityId: shared.entityId,
        targetEntityId: privateContact.entityId,
        relationType: "mentions",
      }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await repo.permissions.grant({
      entityId: privateContact.entityId,
      actorEntityId: f.bob,
      level: "view",
    });
    expect(await f.forActor(f.bob).links.list(shared.entityId)).toHaveLength(1);
    expect(await f.forActor(f.bob).links.list(privateContact.entityId)).toHaveLength(1);
    await repo.permissions.revoke({ entityId: shared.entityId, actorEntityId: f.bob });
    expect(await f.forActor(f.bob).links.list(privateContact.entityId)).toEqual([]);
  });

  test("rejects duplicate, self, and cross-organization links", async () => {
    const repo = f.forActor(f.alice);
    const a = await repo.contacts.create({ displayName: "A" });
    const b = await repo.contacts.create({ displayName: "B" });
    const other = await f.forActor(f.outsider, f.orgB).contacts.create({ displayName: "Other" });
    const link = {
      sourceEntityId: a.entityId,
      targetEntityId: b.entityId,
      relationType: "related_to" as const,
    };
    await repo.links.create(link);
    expect(await repo.links.list(b.entityId)).toEqual(await repo.links.list(a.entityId));
    await expect(repo.links.create(link)).rejects.toThrow();
    await expect(repo.links.create({ ...link, targetEntityId: a.entityId })).rejects.toThrow();
    await expect(
      repo.links.create({ ...link, targetEntityId: other.entityId }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    expect(await repo.links.list(a.entityId)).toHaveLength(1);
  });

  test("only an editor of the source can remove a link", async () => {
    const repo = f.forActor(f.alice);
    const a = await repo.contacts.create({ displayName: "A" });
    const b = await repo.contacts.create({ displayName: "B" });
    const link = {
      sourceEntityId: a.entityId,
      targetEntityId: b.entityId,
      relationType: "related_to" as const,
    };
    await repo.links.create(link);
    for (const entityId of [a.entityId, b.entityId]) {
      await repo.permissions.grant({ entityId, actorEntityId: f.bob, level: "view" });
    }
    await expect(f.forActor(f.bob).links.remove(link)).rejects.toBeInstanceOf(AccessDeniedError);
    await repo.links.remove(link);
    expect(await repo.links.list(a.entityId)).toEqual([]);
  });
});
