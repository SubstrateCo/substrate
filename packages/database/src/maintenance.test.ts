import { rootEntityValues } from "./core/entities/identity";
import { pruneRecords } from "./maintenance";
import { entities, notifications } from "./schema";
import { setupDatabase } from "./testing/database";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60_000);

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

test("each rule deletes in bounded batches and the next run continues", async () => {
  const entityId = crypto.randomUUID();
  await f.db.insert(entities).values(rootEntityValues(f.orgA, "project", entityId));
  await f.db.insert(notifications).values(
    Array.from({ length: 5 }, () => ({
      organizationId: f.orgA,
      recipientActorEntityId: f.alice,
      kind: "assignment" as const,
      eventKey: crypto.randomUUID(),
      entityId,
      createdAt: daysAgo(91),
      readAt: daysAgo(80),
    })),
  );
  const options = { batchSize: 2, maxBatches: 2 };
  expect(await pruneRecords(f.db, options)).toMatchObject({ readNotifications: 4 });
  expect(await f.db.select().from(notifications)).toHaveLength(1);
  expect(await pruneRecords(f.db, options)).toMatchObject({ readNotifications: 1 });
  expect(await f.db.select().from(notifications)).toEqual([]);
});
