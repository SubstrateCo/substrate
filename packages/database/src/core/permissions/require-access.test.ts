import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { actors } from "../actors/schema";
import { entities } from "../entities/schema";
import { member } from "../organizations/schema";
import { RepositoryContext } from "../repository-context";
import { entityGrants } from "./schema";
import { expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";

const f = setupDatabase();

// A project container and one task inside it.
async function hierarchy() {
  const owner = f.forActor(f.alice);
  const parent = await owner.projects.create({ name: "Parent" });
  const child = await owner.tasks.create({ projectEntityId: parent.entityId, title: "Child" });
  return { owner, parent, child };
}

for (const lock of [false, true]) {
  test(`requireAccess uses ${lock ? 2 : 1} statements with lock=${lock} and preserves entity values`, async () => {
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
      expect(queries).toHaveLength(lock ? 2 : 1);
      return access;
    });
    expect(result).toEqual({ entity: entity!, level: "owner" });
  });
}

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

test("inactive and forged scopes fail the actor precheck before locks or visibility reads", async () => {
  const contact = await f.forActor(f.alice).contacts.create({ displayName: "Private" });
  const { db, queries } = recordQueries();
  const deny = async (actorEntityId: string, organizationId = f.orgA) => {
    for (const lock of [true, false]) {
      queries.length = 0;
      expect(
        await rejection(
          new RepositoryContext(db, { organizationId, actorEntityId }).requireAccess(
            contact.entityId,
            "view",
            lock,
          ),
        ),
      ).toBeInstanceOf(AccessDeniedError);
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

test("a denied inactive scope holds no lock on the access path", async () => {
  const contact = await f.forActor(f.alice).contacts.create({ displayName: "Unlocked" });
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.bob));
  await f.db.transaction(async (tx) => {
    expect(
      await rejection(
        new RepositoryContext(tx, { organizationId: f.orgA, actorEntityId: f.bob }).requireAccess(
          contact.entityId,
          "view",
          true,
        ),
      ),
    ).toBeInstanceOf(AccessDeniedError);
    // A second connection locks the row at once while the denied transaction is still open.
    const rows = await f.db.execute(
      sql`SELECT entity_id FROM ${entities} WHERE entity_id = ${contact.entityId} FOR UPDATE NOWAIT`,
    );
    expect(rows).toHaveLength(1);
  });
});

for (const inherited of [false, true]) {
  test(`locked access sees ${inherited ? "inherited" : "direct"} revocation committed while waiting for the lock`, async () => {
    const { owner, parent, child } = await hierarchy();
    // Grants live on the container. The reader checks the child or the container itself.
    const grantEntityId = parent.entityId;
    const readEntityId = inherited ? child.entityId : parent.entityId;
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
          }).requireAccess(readEntityId, "edit", true);
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
      expect(queries.filter((query) => !["begin", "rollback"].includes(query))).toHaveLength(2);
    } finally {
      release.resolve();
      await Promise.allSettled([writer, ...(reader ? [reader] : [])]);
    }
  });
}
