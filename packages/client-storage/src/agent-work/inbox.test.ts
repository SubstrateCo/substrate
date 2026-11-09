import { ownerBatchWindowMs, ownerMessageDebounceMs } from "./inbox.ts";
import { createSession, item, openTestStore, ownerMessage } from "./test-support.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";

let fixture: Awaited<ReturnType<typeof openTestStore>>;
beforeEach(async () => {
  fixture = await openTestStore();
});
afterEach(() => fixture.cleanup());

test("a repeated wake for the same source creates one item", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  const message = ownerMessage(session);
  expect(await store.inbox.intake([message, { ...message, wakeId: "other" }], 0)).toHaveLength(1);
  expect(await store.inbox.intake([message], 10)).toEqual([]);
});

test("owner messages wait for more messages, and the batch closes two seconds after the first", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  const [first] = await store.inbox.intake([ownerMessage(session)], 0);
  expect(first!.availableAt).toBe(ownerMessageDebounceMs);
  expect(await store.turns.claim(ownerMessageDebounceMs - 1)).toEqual([]);

  // Each new message pushes the batch out, but never past the window.
  let now = 0;
  for (let index = 0; index < 4; index++) {
    now += 400;
    await store.inbox.intake([ownerMessage(session)], now);
  }
  const items = await store.inbox.openForSessions([session.id]);
  expect(items.map((row) => row.availableAt)).toEqual(Array(5).fill(ownerBatchWindowMs));
  const [claimed] = await store.turns.claim(ownerBatchWindowMs);
  expect(claimed!.items).toHaveLength(5);
});

test("answers are available at once", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  expect(await store.turns.claim(0)).toHaveLength(1);
});
