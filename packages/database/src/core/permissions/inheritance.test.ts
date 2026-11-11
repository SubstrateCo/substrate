import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { contacts } from "../contacts/schema";
import { entities } from "../entities/schema";
import { member } from "../organizations/schema";
import { entityGrants } from "./schema";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("inherited access applies to reads, lists, edits, and revocations", async () => {
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  const owner = f.forActor(f.alice);
  const parent = await owner.contacts.create({ displayName: "Parent" });
  const [entity] = await f.db
    .insert(entities)
    .values({ organizationId: f.orgA, entityType: "contact", accessEntityId: parent.entityId })
    .returning();
  const childId = entity!.entityId;
  await f.db
    .insert(contacts)
    .values({ entityId: childId, organizationId: f.orgA, displayName: "Child" });
  await owner.permissions.grant({ entityId: parent.entityId, actorEntityId: f.bob, level: "edit" });
  expect(await f.accessLevel(f.bob, childId)).toBe("edit");
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

test("a grant row on a child gives no access; only its container's grants count", async () => {
  const alice = f.forActor(f.alice);
  const parent = await alice.contacts.create({ displayName: "Parent" });
  const [entity] = await f.db
    .insert(entities)
    .values({ organizationId: f.orgA, entityType: "contact", accessEntityId: parent.entityId })
    .returning();
  const childId = entity!.entityId;
  await f.db
    .insert(contacts)
    .values({ entityId: childId, organizationId: f.orgA, displayName: "Child" });
  await f.db
    .insert(entityGrants)
    .values({ organizationId: f.orgA, entityId: childId, actorEntityId: f.bob, level: "owner" });
  await expect(f.accessLevel(f.bob, childId)).rejects.toBeInstanceOf(AccessDeniedError);
  expect(await f.forActor(f.bob).contacts.list()).toEqual([]);
  await alice.permissions.grant({ entityId: parent.entityId, actorEntityId: f.bob, level: "view" });
  expect(await f.accessLevel(f.bob, childId)).toBe("view");
  expect(await f.forActor(f.bob).contacts.list()).toHaveLength(2);
});
