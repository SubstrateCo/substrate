import { AccessDeniedError } from "../../errors";
import * as schema from "../../schema";
import { actors, entities, member, userAgents } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { ensureOwnedAgentActors, ensureUserAgentActor } from "./provisioning";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

const f = setupDatabase();
const input = { organizationId: "org-a", userId: "alice" };

async function profiles(count: number) {
  return f.db
    .insert(userAgents)
    .values(
      Array.from({ length: count }, (_, i) => ({
        userId: "alice",
        name: `Assistant ${i}`,
        instructions: "Help",
        harness: "opencode" as const,
      })),
    )
    .returning();
}

test("owned provisioning has constant read cost for cold and warm batches", async () => {
  const statements: string[] = [];
  const db = drizzle(f.db.$client, {
    schema,
    logger: { logQuery: (query) => statements.push(query) },
  });
  const measurements = [];
  for (const count of [1, 8]) {
    await profiles(count === 1 ? 1 : 7);
    statements.length = 0;
    const cold = await ensureOwnedAgentActors(db, input);
    const coldReads = statements.filter((query) => /^select\b/i.test(query)).length;
    statements.length = 0;
    const warm = await ensureOwnedAgentActors(db, input);
    measurements.push({
      count,
      coldReads,
      warmReads: statements.filter((query) => /^select\b/i.test(query)).length,
      warmLocks: statements.filter((query) => query.includes("for update")).length,
    });
    expect(cold).toHaveLength(count);
    expect(warm.map((actor) => actor.entityId).sort()).toEqual(
      cold.map((actor) => actor.entityId).sort(),
    );
    expect(statements.filter((query) => /^insert\b/i.test(query))).toHaveLength(0);
  }
  console.log("owned provisioning SELECT counts:", JSON.stringify(measurements));
  // A cold batch adds the lock-free check to the three locking reads. A warm batch is one
  // lock-free read.
  expect(measurements).toEqual([
    { count: 1, coldReads: 4, warmReads: 1, warmLocks: 0 },
    { count: 8, coldReads: 4, warmReads: 1, warmLocks: 0 },
  ]);
});

test("owned provisioning filters owner and profile lifecycle without replacing inactive identities", async () => {
  const [active, disabled, deleted, restored] = await profiles(4);
  const existing = await ensureUserAgentActor(f.db, { ...input, userAgentId: restored!.id });
  await f.db
    .update(actors)
    .set({ disabledAt: new Date() })
    .where(eq(actors.entityId, existing.entityId));
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, existing.entityId));
  await f.db.update(userAgents).set({ enabled: false }).where(eq(userAgents.id, disabled!.id));
  await f.db
    .update(userAgents)
    .set({ deletedAt: new Date() })
    .where(eq(userAgents.id, deleted!.id));
  await f.db
    .insert(userAgents)
    .values({ userId: "bob", name: "Bob's", instructions: "Help", harness: "opencode" });
  const result = await ensureOwnedAgentActors(f.db, input);
  expect(new Set(result.map((actor) => actor.userAgentId))).toEqual(
    new Set([active!.id, restored!.id]),
  );
  expect(result.find((actor) => actor.userAgentId === restored!.id)).toEqual({
    ...existing,
    disabledAt: expect.any(Date),
  });
  await f.db.update(userAgents).set({ enabled: true }).where(eq(userAgents.id, disabled!.id));
  await f.db.update(userAgents).set({ deletedAt: null }).where(eq(userAgents.id, deleted!.id));
  expect(await ensureOwnedAgentActors(f.db, input)).toHaveLength(4);
  expect(await f.db.select().from(actors).where(eq(actors.userAgentId, restored!.id))).toHaveLength(
    1,
  );
});

test("bulk and single provisioning serialize and keep organization identities separate", async () => {
  const agents = await profiles(5);
  const before = await f.db.select().from(entities);
  const [first, second, single] = await Promise.all([
    ensureOwnedAgentActors(f.db, input),
    ensureOwnedAgentActors(f.db, input),
    ensureUserAgentActor(f.db, { ...input, userAgentId: agents[0]!.id }),
  ]);
  expect(first.map((actor) => actor.entityId).sort()).toEqual(
    second.map((actor) => actor.entityId).sort(),
  );
  expect(first.find((actor) => actor.userAgentId === agents[0]!.id)?.entityId).toBe(
    single.entityId,
  );
  expect(await f.db.select().from(entities)).toHaveLength(before.length + 5);
  await f.db.insert(member).values({ id: "alice-b", organizationId: f.orgB, userId: "alice" });
  const other = await ensureOwnedAgentActors(f.db, { ...input, organizationId: f.orgB });
  expect(other).toHaveLength(5);
  expect(
    other.every(
      (actor) =>
        actor.organizationId === f.orgB && !first.some((a) => a.entityId === actor.entityId),
    ),
  ).toBe(true);
});

test("membership loss denies batches including owners with no profiles", async () => {
  expect(await ensureOwnedAgentActors(f.db, input)).toEqual([]);
  await expect(
    ensureOwnedAgentActors(f.db, { ...input, userId: "outsider" }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await profiles(2);
  await ensureOwnedAgentActors(f.db, input);
  await f.db.delete(member).where(eq(member.id, "alice-a"));
  const before = await f.db.select().from(entities);
  await expect(ensureOwnedAgentActors(f.db, input)).rejects.toBeInstanceOf(AccessDeniedError);
  expect(await f.db.select().from(entities)).toEqual(before);
});

test("a failed actor insert rolls back the entire batch without orphan entities", async () => {
  await f.db.insert(userAgents).values([
    {
      id: "00000000-0000-0000-0000-000000000001",
      userId: "alice",
      name: "Valid",
      instructions: "Help",
      harness: "opencode",
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      userId: "alice",
      name: " ",
      instructions: "Help",
      harness: "opencode",
    },
  ]);
  const beforeEntities = await f.db.select().from(entities);
  const beforeActors = await f.db.select().from(actors);
  await expect(ensureOwnedAgentActors(f.db, input)).rejects.toMatchObject({
    cause: { code: "23514" },
  });
  expect(await f.db.select().from(entities)).toEqual(beforeEntities);
  expect(await f.db.select().from(actors)).toEqual(beforeActors);
});
