import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { contacts } from "../contacts/schema";
import { entities } from "../entities/schema";
import { member } from "../organizations/schema";
import { entityGrants } from "./schema";
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
  expect(await rejection(f.forActor(f.bob).entities.get(childId))).toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, parent.entityId));
  expect(await rejection(owner.entities.get(childId))).toBeInstanceOf(AccessDeniedError);
});

test("the database rejects a grant on a child; only its container's grants count", async () => {
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
  expect(
    await rejection(
      f.db
        .insert(entityGrants)
        .values({ organizationId: f.orgA, entityId: childId, actorEntityId: f.bob, level: "owner" })
        .execute(),
    ),
  ).toMatchObject({ cause: { code: "23503" } });
  expect(await rejection(f.accessLevel(f.bob, childId))).toBeInstanceOf(AccessDeniedError);
  expect(await f.forActor(f.bob).contacts.list()).toEqual([]);
  await alice.permissions.grant({ entityId: parent.entityId, actorEntityId: f.bob, level: "view" });
  expect(await f.accessLevel(f.bob, childId)).toBe("view");
  expect(await f.forActor(f.bob).contacts.list()).toHaveLength(2);
});

test("the database keeps a container with grants from becoming a child", async () => {
  const alice = f.forActor(f.alice);
  const parent = await alice.contacts.create({ displayName: "Parent" });
  const other = await alice.contacts.create({ displayName: "Other" });
  expect(
    await rejection(
      f.db
        .update(entities)
        .set({ accessEntityId: parent.entityId })
        .where(eq(entities.entityId, other.entityId))
        .execute(),
    ),
  ).toMatchObject({ cause: { code: "23503" } });
});
