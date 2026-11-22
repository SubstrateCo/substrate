import { AccessDeniedError } from "../../errors";
import { actors, entities, member, userAgents } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { workspaceContext } from "../session/workspace";
import { ensureOwnedAgentActors, ensureUserAgentActor } from "./provisioning";
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
    logger: { logQuery: (query) => statements.push(query) },
  });
  const measurements = [];
  for (const count of [1, 8]) {
    await profiles(count === 1 ? 1 : 7);
    statements.length = 0;
    const cold = await ensureOwnedAgentActors(db, input);
    const coldReads = statements.filter((query) => /^select\b/i.test(query)).length;
    const coldLocks = statements.filter((query) =>
      /for (?:no key update|key share|share|update)\b/i.test(query),
    ).length;
    statements.length = 0;
    const warm = await ensureOwnedAgentActors(db, input);
    measurements.push({
      count,
      coldReads,
      coldLocks,
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
  // A cold batch checks membership, enabled profiles and existing identities without row locks.
  // A warm batch is one read.
  expect(measurements).toEqual([
    { count: 1, coldReads: 4, coldLocks: 0, warmReads: 1, warmLocks: 0 },
    { count: 8, coldReads: 4, coldLocks: 0, warmReads: 1, warmLocks: 0 },
  ]);
});

test("cold owned provisioning writes one or many agent actors in the same statements", async () => {
  const counts = [];
  let total = 0;
  for (const count of [1, 8]) {
    const added = await profiles(count);
    total += count;
    const { db, queries } = recordQueries();
    const owned = await ensureOwnedAgentActors(db, input);
    expect(owned).toHaveLength(total);
    expect(added.every((agent) => owned.some((actor) => actor.userAgentId === agent.id))).toBe(
      true,
    );
    counts.push(queries.length);
  }
  expect(counts[1]).toBe(counts[0]);
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

test("bulk and single provisioning converge and keep organization identities separate", async () => {
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

test("existing agent and human actors resolve in one lock-free statement that checks membership", async () => {
  await f.verifyEmails();
  const [agent] = await profiles(1);
  const created = await ensureUserAgentActor(f.db, { ...input, userAgentId: agent!.id });
  const { db, queries } = recordQueries();
  expect(await ensureUserAgentActor(db, { ...input, userAgentId: agent!.id })).toEqual(created);
  expect((await workspaceContext(db, input)).actor.entityId).toBe(f.alice);
  expect(queries).toHaveLength(2);
  expect(queries.some((query) => query.includes("for update"))).toBe(false);
  await f.db.update(userAgents).set({ enabled: false }).where(eq(userAgents.id, agent!.id));
  expect(
    await rejection(ensureUserAgentActor(f.db, { ...input, userAgentId: agent!.id })),
  ).toBeInstanceOf(AccessDeniedError);
  await f.db.update(userAgents).set({ enabled: true }).where(eq(userAgents.id, agent!.id));
  await f.db.delete(member).where(eq(member.id, "alice-a"));
  expect(
    await rejection(ensureUserAgentActor(f.db, { ...input, userAgentId: agent!.id })),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(workspaceContext(f.db, input))).toBeInstanceOf(AccessDeniedError);
});

test("membership loss denies batches including owners with no profiles", async () => {
  expect(await ensureOwnedAgentActors(f.db, input)).toEqual([]);
  expect(
    await rejection(ensureOwnedAgentActors(f.db, { ...input, userId: "outsider" })),
  ).toBeInstanceOf(AccessDeniedError);
  await profiles(2);
  await ensureOwnedAgentActors(f.db, input);
  await f.db.delete(member).where(eq(member.id, "alice-a"));
  const before = await f.db.select().from(entities);
  expect(await rejection(ensureOwnedAgentActors(f.db, input))).toBeInstanceOf(AccessDeniedError);
  expect(await f.db.select().from(entities)).toEqual(before);
});
