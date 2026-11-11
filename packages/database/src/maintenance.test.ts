import { rootEntityValues } from "./core/entities/identity";
import { pruneRecords } from "./maintenance";
import { agentWakes, entities, notifications } from "./schema";
import { agentWorkFixture } from "./testing/agent-work";
import { setupDatabase } from "./testing/database";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60_000);

/** Copies of one real wake, acked at the given ages; null stays pending. */
async function wakes(...ackedDaysAgo: (number | null)[]) {
  const { alice, dm } = await agentWorkFixture(f);
  await alice.sendMessage(dm.id, "Hello");
  const [wake] = await f.db.select().from(agentWakes);
  await f.db.delete(agentWakes);
  const rows = ackedDaysAgo.map((age) => ({
    ...wake!,
    id: crypto.randomUUID(),
    dedupeKey: crypto.randomUUID(),
    createdAt: daysAgo(60),
    ackedAt: age === null ? null : daysAgo(age),
  }));
  await f.db.insert(agentWakes).values(rows);
  return rows.map((row) => row.id);
}

const remaining = async () =>
  (await f.db.select({ id: agentWakes.id }).from(agentWakes)).map(({ id }) => id);

test("wakes acked more than 7 days ago are deleted; pending and recent ones stay", async () => {
  const [old, recent, pending] = await wakes(8, 6, null);
  expect(await pruneRecords(f.db)).toMatchObject({ ackedWakes: 1 });
  expect((await remaining()).sort()).toEqual([recent!, pending!].sort());
  expect(await remaining()).not.toContain(old);
});

test("each rule deletes in bounded batches and the next run continues", async () => {
  await wakes(8, 8, 8, 8, 8);
  expect(await pruneRecords(f.db, { batchSize: 2, maxBatches: 2 })).toMatchObject({
    ackedWakes: 4,
  });
  expect(await remaining()).toHaveLength(1);
  expect(await pruneRecords(f.db, { batchSize: 2, maxBatches: 2 })).toMatchObject({
    ackedWakes: 1,
  });
  expect(await remaining()).toEqual([]);
});

test("read notifications older than 90 days and notifications of deleted records are deleted", async () => {
  const [live, deleted] = [crypto.randomUUID(), crypto.randomUUID()];
  await f.db
    .insert(entities)
    .values([live, deleted].map((entityId) => rootEntityValues(f.orgA, "project", entityId)));
  const notification = (entityId: string, createdDays: number, readDays: number | null) => ({
    organizationId: f.orgA,
    recipientActorEntityId: f.alice,
    kind: "assignment" as const,
    eventKey: crypto.randomUUID(),
    entityId,
    createdAt: daysAgo(createdDays),
    readAt: readDays === null ? null : daysAgo(readDays),
  });
  const rows = await f.db
    .insert(notifications)
    .values([
      notification(live, 91, 80),
      notification(live, 89, 80),
      notification(live, 200, null),
      notification(deleted, 1, null),
    ])
    .returning({ id: notifications.id });
  await f.db.update(entities).set({ deletedAt: new Date() }).where(eq(entities.entityId, deleted));
  expect(await pruneRecords(f.db)).toMatchObject({
    readNotifications: 1,
    deletedTargetNotifications: 1,
  });
  const kept = await f.db.select({ id: notifications.id }).from(notifications);
  expect(kept.map(({ id }) => id).sort()).toEqual([rows[1]!.id, rows[2]!.id].sort());
});
