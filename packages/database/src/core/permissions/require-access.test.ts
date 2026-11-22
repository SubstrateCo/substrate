import { AccessDeniedError, ConflictError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { actors } from "../actors/schema";
import { entities } from "../entities/schema";
import { member } from "../organizations/schema";
import { RepositoryContext, type EntityAccess } from "../repository-context";
import { entityAccessLevel } from "./visibility";
import { expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

const f = setupDatabase();

test("single-entity access reads its target once for both grants and admin access", async () => {
  const { child } = await hierarchy();
  const { db, queries } = recordQueries();
  const [access] = await db.execute<{ level: string }>(
    sql`select ${entityAccessLevel({ organizationId: f.orgA, actorEntityId: f.alice }, child.entityId)} as level`,
  );
  expect(access?.level).toBe("owner");
  expect(queries[0]?.match(/FROM "entities" e/g)).toHaveLength(1);
});

// A project container and one task inside it.
async function hierarchy() {
  const owner = f.forActor(f.alice);
  const parent = await owner.projects.create({ name: "Parent" });
  const child = await owner.tasks.create({ projectEntityId: parent.entityId, title: "Child" });
  return { owner, parent, child };
}

test("requireAccess uses one statement and preserves entity values", async () => {
  const contact = await f.forActor(f.alice).contacts.create({ displayName: "Owned" });
  const [entity] = await f.db
    .select()
    .from(entities)
    .where(eq(entities.entityId, contact.entityId));
  const { db, queries } = recordQueries();
  const scope = { organizationId: f.orgA, actorEntityId: f.alice };
  const access: EntityAccess = await new RepositoryContext(db, scope).requireAccess(
    contact.entityId,
    "owner",
  );
  expect(queries).toHaveLength(1);
  expect(access).toEqual({ entity: entity!, level: "owner" });
});

test("the container grant sets the child's level and enforces every permission rank", async () => {
  const { owner, parent, child } = await hierarchy();
  const context = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.bob });
  for (const [level, denied] of [
    ["owner", null],
    ["edit", "owner"],
    ["comment", "edit"],
    ["view", "comment"],
  ] as const) {
    await owner.permissions.grant({ entityId: parent.entityId, actorEntityId: f.bob, level });
    expect((await context.requireAccess(child.entityId, level)).level).toBe(level);
    if (denied)
      expect(await rejection(context.requireAccess(child.entityId, denied))).toBeInstanceOf(
        AccessDeniedError,
      );
  }
});

test("a deleted container hides its live child, and a deleted child is hidden", async () => {
  const { owner, parent, child } = await hierarchy();
  await owner.permissions.grant({
    entityId: parent.entityId,
    actorEntityId: f.bob,
    level: "owner",
  });
  const context = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.bob });
  expect((await context.requireAccess(child.entityId, "owner")).level).toBe("owner");
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, parent.entityId));
  expect(await rejection(context.requireAccess(child.entityId, "view"))).toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db
    .update(entities)
    .set({ deletedAt: null })
    .where(eq(entities.entityId, parent.entityId));
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, child.entityId));
  expect(await rejection(context.requireAccess(child.entityId, "view"))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect((await context.requireAccess(parent.entityId, "owner")).level).toBe("owner");
});

test("missing, deleted, and foreign entities are denied even with an active actor", async () => {
  const local = await f.forActor(f.alice).contacts.create({ displayName: "Local" });
  const foreign = await f.forActor(f.outsider, f.orgB).contacts.create({ displayName: "Foreign" });
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, local.entityId));
  const context = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.alice });
  for (const id of [local.entityId, foreign.entityId, crypto.randomUUID()]) {
    expect(await rejection(context.requireAccess(id, "view"))).toBeInstanceOf(AccessDeniedError);
  }
});

test("inactive and forged scopes are denied in one statement", async () => {
  const contact = await f.forActor(f.alice).contacts.create({ displayName: "Private" });
  const { db, queries } = recordQueries();
  const deny = async (actorEntityId: string, organizationId = f.orgA) => {
    queries.length = 0;
    expect(
      await rejection(
        new RepositoryContext(db, { organizationId, actorEntityId }).requireAccess(
          contact.entityId,
          "view",
        ),
      ),
    ).toBeInstanceOf(AccessDeniedError);
    expect(queries).toHaveLength(1);
  };
  await deny(f.outsider);
  await deny(f.alice, f.orgB);
  await deny(crypto.randomUUID());
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.alice));
  await deny(f.alice);
  await f.db.update(actors).set({ disabledAt: null }).where(eq(actors.entityId, f.alice));
  await f.db.update(entities).set({ deletedAt: new Date() }).where(eq(entities.entityId, f.alice));
  await deny(f.alice);
  await f.db.update(entities).set({ deletedAt: null }).where(eq(entities.entityId, f.alice));
  await f.db.delete(member).where(eq(member.id, "alice-a"));
  await deny(f.alice);
});

test("requireAccessAll grants every entity or denies them all", async () => {
  const { parent, child } = await hierarchy();
  const context = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.alice });
  const granted = await context.requireAccessAll([child.entityId, parent.entityId], "edit");
  expect(granted.map((access) => access.entity.entityId)).toEqual([
    child.entityId,
    parent.entityId,
  ]);
  expect(
    await rejection(context.requireAccessAll([parent.entityId, crypto.randomUUID()], "view")),
  ).toBeInstanceOf(AccessDeniedError);
});

const accessVersion = async (entityId: string) =>
  (
    await f.db
      .select({ version: entities.accessVersion })
      .from(entities)
      .where(eq(entities.entityId, entityId))
  )[0]!.version;

test("a structural claim on a child advances its container's version once", async () => {
  const { parent, child } = await hierarchy();
  const scope = { organizationId: f.orgA, actorEntityId: f.alice };
  const [parentBefore, childBefore] = [
    await accessVersion(parent.entityId),
    await accessVersion(child.entityId),
  ];
  const { db, queries } = recordQueries();
  const access = await new RepositoryContext(db, scope).requireStructuralAccessAll(
    [child.entityId, parent.entityId],
    "owner",
  );
  // One read, and one claim for the container that both entities share.
  expect(queries).toHaveLength(2);
  expect(access.map(({ entity, level }) => [entity.entityId, level])).toEqual([
    [child.entityId, "owner"],
    [parent.entityId, "owner"],
  ]);
  expect(await accessVersion(parent.entityId)).toBe(parentBefore + 1);
  expect(await accessVersion(child.entityId)).toBe(childBefore);
});

test("a denied structural claim changes nothing", async () => {
  const { owner, parent, child } = await hierarchy();
  await owner.permissions.grant({ entityId: parent.entityId, actorEntityId: f.bob, level: "edit" });
  const before = await accessVersion(parent.entityId);
  const bob = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.bob });
  for (const id of [child.entityId, parent.entityId, crypto.randomUUID()])
    expect(await rejection(bob.requireStructuralAccess(id, "owner"))).toBeInstanceOf(
      AccessDeniedError,
    );
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.alice));
  expect(
    await rejection(
      new RepositoryContext(f.db, {
        organizationId: f.orgA,
        actorEntityId: f.alice,
      }).requireStructuralAccess(parent.entityId, "owner"),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await accessVersion(parent.entityId)).toBe(before);
});

test("of two concurrent structural claims on one container, one wins and one conflicts", async () => {
  const { parent, child } = await hierarchy();
  const scope = { organizationId: f.orgA, actorEntityId: f.alice };
  const before = await accessVersion(parent.entityId);
  const claimed = Promise.withResolvers<void>();
  const secondRead = Promise.withResolvers<void>();
  // The second connection resolves once it sends its claim, so it read the old version first.
  const { db: second } = recordQueries((query) => {
    if (query.startsWith('update "entities"')) secondRead.resolve();
  });
  const first = f.db.transaction(async (tx) => {
    await new RepositoryContext(tx, scope).requireStructuralAccess(parent.entityId, "owner");
    claimed.resolve();
    await secondRead.promise;
  });
  await claimed.promise;
  const results = await Promise.allSettled([
    first,
    second.transaction((tx) =>
      new RepositoryContext(tx, scope).requireStructuralAccess(child.entityId, "owner"),
    ),
  ]);
  expect(results[0].status).toBe("fulfilled");
  expect(results[1]).toMatchObject({ status: "rejected", reason: expect.any(ConflictError) });
  expect(await accessVersion(parent.entityId)).toBe(before + 1);
});

test("structural claims on different containers do not conflict", async () => {
  const { parent } = await hierarchy();
  const other = await f.forActor(f.alice).projects.create({ name: "Other" });
  const scope = { organizationId: f.orgA, actorEntityId: f.alice };
  await f.db.transaction(async (tx) => {
    await new RepositoryContext(tx, scope).requireStructuralAccess(parent.entityId, "owner");
    // The first claim is still open. A claim on another container finishes at once.
    const access = await f.db.transaction((second) =>
      new RepositoryContext(second, scope).requireStructuralAccess(other.entityId, "owner"),
    );
    expect(access.entity.entityId).toBe(other.entityId);
  });
});
