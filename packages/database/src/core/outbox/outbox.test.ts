import { realtimeKeys } from "@substrate/contracts/realtime";

import { setupDatabase } from "../../testing/database";
import { commit, effectsFor } from "../effects";
import { claimOutbox, finishOutbox, outboxMaxAttempts } from "./outbox";
import { realtimeOutbox } from "./schema";
import { expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

const f = setupDatabase();
const hint = { audience: realtimeKeys.organization("org-a"), domain: "tasks" as const };

const rows = () => f.db.select().from(realtimeOutbox);
const makeDue = (id?: string) =>
  f.db
    .update(realtimeOutbox)
    .set({ nextAttemptAt: sql`now() - interval '1 second'` })
    .where(id ? eq(realtimeOutbox.id, id) : undefined);

test("a committed write stores its hints with their event IDs, and a failed one stores nothing", async () => {
  const committed = await commit(f.db, async (tx) => {
    effectsFor(tx).hint(hint);
    return "saved";
  });
  expect(committed.outbox?.changes).toEqual([{ ...hint, id: expect.any(String) }]);
  expect(await rows()).toMatchObject([
    { id: committed.outbox!.id, changes: committed.outbox!.changes },
  ]);
  const failed = commit(f.db, async (tx) => {
    effectsFor(tx).hint(hint);
    throw new Error("rolled back");
  });
  expect(failed).rejects.toThrow("rolled back");
  await failed.catch(() => {});
  expect(await commit(f.db, async () => "no hints")).not.toHaveProperty("outbox");
  expect(await rows()).toHaveLength(1);
});

test("the relay claims a batch only after the server's own publish had time, and only once", async () => {
  const { outbox } = await commit(f.db, async (tx) => {
    effectsFor(tx).hint(hint);
  });
  expect(await claimOutbox(f.db)).toEqual([]);
  await makeDue();
  const claims = await Promise.all([claimOutbox(f.db), claimOutbox(f.db)]);
  expect(claims.flat()).toEqual([{ id: outbox!.id, changes: outbox!.changes }]);
  expect(await claimOutbox(f.db)).toEqual([]);
  await finishOutbox(f.db, outbox!.id);
  expect(await rows()).toEqual([]);
});

test("a batch that keeps failing is dropped after its last attempt", async () => {
  const { outbox } = await commit(f.db, async (tx) => {
    effectsFor(tx).hint(hint);
  });
  await f.db
    .update(realtimeOutbox)
    .set({ attempts: outboxMaxAttempts - 1 })
    .where(eq(realtimeOutbox.id, outbox!.id));
  await makeDue();
  expect(await claimOutbox(f.db)).toHaveLength(1);
  await makeDue();
  expect(await claimOutbox(f.db)).toEqual([]);
  expect(await rows()).toEqual([]);
});
