import { AccessDeniedError } from "../errors";
import { setupDatabase } from "../testing/database";
import { rejection } from "../testing/rejection";
import { actors } from "./actors/schema";
import { entityGrants } from "./permissions/schema";
import { RepositoryContext } from "./repository-context";
import { expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";

const f = setupDatabase();

test("a root is its own owned container, and children share the root's container without grants", async () => {
  const context = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.alice });
  const root = await context.createEntity("project");
  const [child, grandchild] = await context.transaction(async (tx) => {
    const child = await tx.createChildEntity("task", await tx.requireAccess(root.entityId, "edit"));
    const grandchild = await tx.createChildEntity(
      "task",
      await tx.requireAccess(child.entityId, "edit"),
    );
    return [child, grandchild];
  });
  expect(root.accessEntityId).toBe(root.entityId);
  expect(child.accessEntityId).toBe(root.entityId);
  expect(grandchild.accessEntityId).toBe(root.entityId);
  const grants = await f.db
    .select({
      entityId: entityGrants.entityId,
      actorEntityId: entityGrants.actorEntityId,
      level: entityGrants.level,
    })
    .from(entityGrants)
    .where(inArray(entityGrants.entityId, [root.entityId, child.entityId, grandchild.entityId]));
  expect(grants).toEqual([{ entityId: root.entityId, actorEntityId: f.alice, level: "owner" }]);
});

test("a context outside a session lists and opens nothing once its actor is disabled", async () => {
  const bob = f.forActor(f.bob);
  const project = await f.forActor(f.alice).projects.create({ name: "Shared" });
  await f.forActor(f.alice).projects.share(project.entityId, f.bob, "view");
  const contact = await bob.contacts.createContact({ displayName: "Lead" });
  const context = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.bob });
  expect(await bob.projects.list()).toHaveLength(1);
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.bob));
  expect(await bob.projects.list()).toEqual([]);
  expect(await bob.contacts.listContacts()).toEqual([]);
  expect(await rejection(context.requireAccess(project.entityId, "view"))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(context.requireAccess(contact.entityId, "view"))).toBeInstanceOf(
    AccessDeniedError,
  );
});
