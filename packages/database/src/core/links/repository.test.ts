import { AccessDeniedError } from "../../index";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { entityLinks } from "./schema";
import { describe, expect, test } from "bun:test";

const f = setupDatabase();

describe("links", () => {
  test("links do not grant access or reveal inaccessible targets", async () => {
    const repo = f.forActor(f.alice);
    const shared = await repo.contacts.create({ displayName: "Shared" });
    const privateContact = await repo.contacts.create({ displayName: "Private" });
    await repo.links.create({ entityId: shared.entityId, otherEntityId: privateContact.entityId });
    await repo.permissions.grant({
      entityId: shared.entityId,
      actorEntityId: f.bob,
      level: "edit",
    });
    expect(await f.forActor(f.bob).links.list(shared.entityId)).toEqual([]);
    expect(
      await rejection(
        f.forActor(f.bob).links.remove({
          entityId: shared.entityId,
          otherEntityId: privateContact.entityId,
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

  test("related_to has no direction and rejects duplicate, self, and cross-organization links", async () => {
    const repo = f.forActor(f.alice);
    const a = await repo.contacts.create({ displayName: "A" });
    const b = await repo.contacts.create({ displayName: "B" });
    const other = await f.forActor(f.outsider, f.orgB).contacts.create({ displayName: "Other" });
    await repo.links.create({ entityId: b.entityId, otherEntityId: a.entityId });
    const [stored] = await repo.links.list(a.entityId);
    expect([stored!.sourceEntityId, stored!.targetEntityId]).toEqual(
      [a.entityId, b.entityId].sort(),
    );
    expect(await repo.links.list(b.entityId)).toEqual([stored!]);
    await rejection(repo.links.create({ entityId: a.entityId, otherEntityId: b.entityId }));
    await rejection(repo.links.create({ entityId: a.entityId, otherEntityId: a.entityId }));
    expect(
      await rejection(repo.links.create({ entityId: a.entityId, otherEntityId: other.entityId })),
    ).toBeInstanceOf(AccessDeniedError);
    expect(await repo.links.list(a.entityId)).toHaveLength(1);
  });

  test("the database stores related_to only in ID order", async () => {
    const repo = f.forActor(f.alice);
    const a = await repo.contacts.create({ displayName: "A" });
    const b = await repo.contacts.create({ displayName: "B" });
    const [low, high] = [a.entityId, b.entityId].sort();
    expect(
      await rejection(
        f.db.insert(entityLinks).values({
          organizationId: f.orgA,
          sourceEntityId: high!,
          targetEntityId: low!,
          relationType: "related_to",
          createdByActorEntityId: f.alice,
        }),
      ),
    ).toBeInstanceOf(Error);
  });

  test("only an editor of the entity can remove a link", async () => {
    const repo = f.forActor(f.alice);
    const a = await repo.contacts.create({ displayName: "A" });
    const b = await repo.contacts.create({ displayName: "B" });
    const link = { entityId: a.entityId, otherEntityId: b.entityId };
    await repo.links.create(link);
    for (const entityId of [a.entityId, b.entityId]) {
      await repo.permissions.grant({ entityId, actorEntityId: f.bob, level: "view" });
    }
    expect(await rejection(f.forActor(f.bob).links.remove(link))).toBeInstanceOf(AccessDeniedError);
    await repo.links.remove({ entityId: b.entityId, otherEntityId: a.entityId });
    expect(await repo.links.list(a.entityId)).toEqual([]);
  });
});
