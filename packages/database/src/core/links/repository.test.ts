import { AccessDeniedError } from "../../index";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { describe, expect, test } from "bun:test";

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
    expect(
      await rejection(
        f.forActor(f.bob).links.create({
          sourceEntityId: shared.entityId,
          targetEntityId: privateContact.entityId,
          relationType: "mentions",
        }),
      ),
    ).toBeInstanceOf(AccessDeniedError);
    await repo.permissions.grant({
      entityId: privateContact.entityId,
      actorEntityId: f.bob,
      level: "view",
    });
    const bob = f.forActor(f.bob);
    expect(await bob.links.list(shared.entityId)).toHaveLength(1);
    expect(await bob.links.list(privateContact.entityId)).toHaveLength(1);
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
    await rejection(repo.links.create(link));
    await rejection(repo.links.create({ ...link, targetEntityId: a.entityId }));
    expect(
      await rejection(repo.links.create({ ...link, targetEntityId: other.entityId })),
    ).toBeInstanceOf(AccessDeniedError);
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
    expect(await rejection(f.forActor(f.bob).links.remove(link))).toBeInstanceOf(AccessDeniedError);
    await repo.links.remove(link);
    expect(await repo.links.list(a.entityId)).toEqual([]);
  });
});
