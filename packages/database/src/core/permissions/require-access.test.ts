import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { actors } from "../actors/schema";
import { entities } from "../entities/schema";
import { member } from "../organizations/schema";
import { RepositoryContext } from "../repository-context";
import { entityAccessParents } from "./access-parents";
import { entityGrants } from "./schema";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";

const f = setupDatabase();

async function hierarchy() {
  const owner = f.forActor(f.alice);
  const parent = await owner.contacts.create({ displayName: "Parent" });
  const middle = await owner.contacts.create({ displayName: "Middle" });
  const child = await owner.contacts.create({ displayName: "Child" });
  await f.db.insert(entityAccessParents).values([
    { organizationId: f.orgA, entityId: middle.entityId, parentEntityId: parent.entityId },
    { organizationId: f.orgA, entityId: child.entityId, parentEntityId: middle.entityId },
  ]);
  return { owner, parent, middle, child };
}

for (const lock of [false, true]) {
  test(`requireAccess uses ${lock ? 3 : 1} statements with lock=${lock} and preserves entity values`, async () => {
    const contact = await f.forActor(f.alice).contacts.create({ displayName: "Owned" });
    const [entity] = await f.db
      .select()
      .from(entities)
      .where(eq(entities.entityId, contact.entityId));
    const { db, queries } = recordQueries();
    const scope = { organizationId: f.orgA, actorEntityId: f.alice };
    const result = await db.transaction(async (tx) => {
      queries.length = 0;
      const access = await new RepositoryContext(tx, scope).requireAccess(
        contact.entityId,
        "owner",
        lock,
      );
      expect(queries).toHaveLength(lock ? 3 : 1);
      return access;
    });
    expect(result).toEqual({ entity: entity!, level: "owner" });
  });
}

test("strongest direct or inherited grant wins and enforces every permission rank", async () => {
  const { owner, parent, child } = await hierarchy();
  const context = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.bob });
  for (const [inherited, direct, expected, denied] of [
    ["owner", "view", "owner", null],
    ["view", "edit", "edit", "owner"],
    ["comment", "view", "comment", "edit"],
    ["view", "view", "view", "comment"],
  ] as const) {
    await owner.permissions.grant({
      entityId: parent.entityId,
      actorEntityId: f.bob,
      level: inherited,
    });
    await owner.permissions.grant({
      entityId: child.entityId,
      actorEntityId: f.bob,
      level: direct,
    });
    expect((await context.requireAccess(child.entityId, expected)).level).toBe(expected);
    if (denied)
      await expect(context.requireAccess(child.entityId, denied)).rejects.toBeInstanceOf(
        AccessDeniedError,
      );
  }
});

test("deleted ancestors stop inheritance but do not hide a live child's direct grant", async () => {
  const { owner, parent, middle, child } = await hierarchy();
  await owner.permissions.grant({
    entityId: parent.entityId,
    actorEntityId: f.bob,
    level: "owner",
  });
  await owner.permissions.grant({
    entityId: child.entityId,
    actorEntityId: f.bob,
    level: "comment",
  });
  const context = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.bob });
  expect((await context.requireAccess(child.entityId, "owner")).level).toBe("owner");
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, middle.entityId));
  expect((await context.requireAccess(child.entityId, "comment")).level).toBe("comment");
  await expect(context.requireAccess(child.entityId, "edit")).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db
    .delete(entityGrants)
    .where(and(eq(entityGrants.entityId, child.entityId), eq(entityGrants.actorEntityId, f.bob)));
  await expect(context.requireAccess(child.entityId, "view")).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db
    .update(entities)
    .set({ deletedAt: null })
    .where(eq(entities.entityId, middle.entityId));
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, parent.entityId));
  await expect(context.requireAccess(child.entityId, "view")).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
});

test("an access-parent cycle ends the upward walk and keeps the grants on the cycle", async () => {
  const { owner, parent, child } = await hierarchy();
  await f.db
    .insert(entityAccessParents)
    .values({ organizationId: f.orgA, entityId: parent.entityId, parentEntityId: child.entityId });
  await owner.permissions.grant({ entityId: parent.entityId, actorEntityId: f.bob, level: "edit" });
  const context = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.bob });
  expect((await context.requireAccess(child.entityId, "view")).level).toBe("edit");
  expect((await f.forActor(f.bob).contacts.list()).map((row) => row.entityId).sort()).toHaveLength(
    3,
  );
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
    await expect(context.requireAccess(id, "view")).rejects.toBeInstanceOf(AccessDeniedError);
  }
});

test("inactive and forged scopes fail the actor precheck before locks or visibility reads", async () => {
  const contact = await f.forActor(f.alice).contacts.create({ displayName: "Private" });
  const { db, queries } = recordQueries();
  const deny = async (actorEntityId: string, organizationId = f.orgA) => {
    for (const lock of [true, false]) {
      queries.length = 0;
      await expect(
        new RepositoryContext(db, { organizationId, actorEntityId }).requireAccess(
          contact.entityId,
          "view",
          lock,
        ),
      ).rejects.toBeInstanceOf(AccessDeniedError);
      expect(queries).toHaveLength(1);
    }
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

for (const inherited of [false, true]) {
  test(`locked access sees ${inherited ? "inherited" : "direct"} revocation committed while waiting for the lock`, async () => {
    const { owner, parent, child } = await hierarchy();
    const grantEntityId = inherited ? parent.entityId : child.entityId;
    await owner.permissions.grant({ entityId: grantEntityId, actorEntityId: f.bob, level: "edit" });
    const held = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const writer = f.db.transaction(async (tx) => {
      await new RepositoryContext(tx, {
        organizationId: f.orgA,
        actorEntityId: f.alice,
      }).requireAccess(grantEntityId, "owner", true);
      await tx
        .delete(entityGrants)
        .where(
          and(eq(entityGrants.entityId, grantEntityId), eq(entityGrants.actorEntityId, f.bob)),
        );
      held.resolve();
      await release.promise;
    });
    const { db, queries } = recordQueries();
    const started = Promise.withResolvers<number>();
    let reader: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await Promise.race([held.promise, writer]);
      reader = Promise.allSettled([
        db.transaction(async (tx) => {
          const [connection] = await tx.execute<{ pid: number }>(
            sql`SELECT pg_backend_pid() AS pid`,
          );
          queries.length = 0;
          started.resolve(connection!.pid);
          return new RepositoryContext(tx, {
            organizationId: f.orgA,
            actorEntityId: f.bob,
          }).requireAccess(child.entityId, "edit", true);
        }),
      ]);
      const pid = await started.promise;
      let blocked = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        const [state] = await f.db.execute<{ blocked: boolean }>(
          sql`SELECT cardinality(pg_blocking_pids(${pid}::integer)) > 0 AS blocked`,
        );
        if (state!.blocked) {
          blocked = true;
          break;
        }
        await Bun.sleep(10);
      }
      expect(blocked).toBe(true);
      release.resolve();
      await writer;
      const [result] = await reader;
      expect(result!.status).toBe("rejected");
      if (result!.status === "rejected") expect(result!.reason).toBeInstanceOf(AccessDeniedError);
      expect(queries.filter((query) => !["begin", "rollback"].includes(query))).toHaveLength(3);
    } finally {
      release.resolve();
      await Promise.allSettled([writer, ...(reader ? [reader] : [])]);
    }
  });
}
