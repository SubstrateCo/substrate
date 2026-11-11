import { setupDatabase } from "../testing/database";
import { entityGrants } from "./permissions/schema";
import { RepositoryContext } from "./repository-context";
import { expect, test } from "bun:test";
import { inArray } from "drizzle-orm";

const f = setupDatabase();

test("a root is its own owned container, and children share the root's container without grants", async () => {
  const context = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.alice });
  const root = await context.createEntity("project");
  const child = await context.createChildEntity("task", root.entityId);
  const grandchild = await context.createChildEntity("task", child.entityId);
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
