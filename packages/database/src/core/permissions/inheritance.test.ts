import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { contacts } from "../contacts/schema";
import { entities } from "../entities/schema";
import { entityAccessParents } from "./access-parents";
import { entityGrants } from "./schema";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("inherited access applies to reads, lists, edits, and revocations", async () => {
  const owner = f.forActor(f.alice);
  const parent = await owner.contacts.create({ displayName: "Parent" });
  const [entity] = await f.db
    .insert(entities)
    .values({ organizationId: f.orgA, entityType: "contact" })
    .returning();
  const childId = entity!.entityId;
  await f.db
    .insert(contacts)
    .values({ entityId: childId, organizationId: f.orgA, displayName: "Child" });
  await f.db
    .insert(entityAccessParents)
    .values({ organizationId: f.orgA, entityId: childId, parentEntityId: parent.entityId });
  await owner.permissions.grant({ entityId: parent.entityId, actorEntityId: f.bob, level: "edit" });
  expect(await f.forActor(f.bob).permissions.getEffectiveLevel(childId)).toBe("edit");
  expect(await f.forActor(f.bob).contacts.list()).toHaveLength(2);
  expect(
    (await f.forActor(f.bob).contacts.update(childId, { displayName: "Edited" })).displayName,
  ).toBe("Edited");
  await owner.permissions.revoke({ entityId: parent.entityId, actorEntityId: f.bob });
  await expect(f.forActor(f.bob).entities.get(childId)).rejects.toBeInstanceOf(AccessDeniedError);
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, parent.entityId));
  await expect(owner.entities.get(childId)).rejects.toBeInstanceOf(AccessDeniedError);
});

test("revoking a child owner grant falls back to inherited access without stranding the item", async () => {
  const owner = f.forActor(f.alice);
  const parent = await owner.contacts.create({ displayName: "Parent" });
  const child = await owner.contacts.create({ displayName: "Child" });
  await f.db
    .insert(entityAccessParents)
    .values({ organizationId: f.orgA, entityId: child.entityId, parentEntityId: parent.entityId });
  await f.db.delete(entityGrants).where(eq(entityGrants.entityId, child.entityId));
  await owner.permissions.grant({ entityId: parent.entityId, actorEntityId: f.bob, level: "view" });
  await owner.permissions.grant({ entityId: child.entityId, actorEntityId: f.bob, level: "owner" });
  expect(await f.forActor(f.bob).permissions.getEffectiveLevel(child.entityId)).toBe("owner");
  await owner.permissions.revoke({ entityId: child.entityId, actorEntityId: f.bob });
  expect(await f.forActor(f.bob).permissions.getEffectiveLevel(child.entityId)).toBe("view");
  expect(await owner.permissions.getEffectiveLevel(child.entityId)).toBe("owner");
});
