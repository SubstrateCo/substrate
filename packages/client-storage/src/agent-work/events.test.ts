import { openTestStore, turnRun } from "./test-support.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

let fixture: Awaited<ReturnType<typeof openTestStore>>;
beforeEach(async () => {
  fixture = await openTestStore();
});
afterEach(() => fixture.cleanup());

test("events are numbered without gaps across the attempts of a turn", async () => {
  const { store } = fixture;
  const first = turnRun();
  await store.turnRuns.begin("org-1", first, 0);
  await store.events.append("org-1", first, [{ kind: "text", data: { text: "a" } }], 1);
  await store.turnRuns.begin("org-1", { ...first, attempt: 2 }, 2);
  await store.events.append(
    "org-1",
    { turnId: first.turnId, attempt: 2 },
    [
      { kind: "text", data: { text: "b" } },
      { kind: "text", data: { text: "c" } },
    ],
    3,
  );
  const events = await store.events.list("org-1", first.turnId);
  expect(events.map((event) => [event.seq, event.attempt])).toEqual([
    [1, 1],
    [2, 2],
    [3, 2],
  ]);
  expect(
    (await store.turnRuns.forTurn("org-1", first.turnId)).map((row) => row.eventCount),
  ).toEqual([1, 2]);
});

test("events need an attempt that ran in the same organization", async () => {
  const { store } = fixture;
  const run = turnRun();
  await rejects(store.events.append("org-1", run, [{ kind: "note", data: { text: "x" } }], 0));
  await store.turnRuns.begin("org-1", run, 0);
  await rejects(store.events.append("org-2", run, [{ kind: "note", data: { text: "x" } }], 0));
  await store.events.append("org-1", run, [{ kind: "note", data: { text: "x" } }], 0);
  expect(await store.events.list("org-2", run.turnId)).toEqual([]);
  expect(await store.turnRuns.forTurn("org-2", run.turnId)).toEqual([]);
});

test("a tool call of the attempt without its completion is unfinished", async () => {
  const { store } = fixture;
  const run = turnRun();
  await store.turnRuns.begin("org-1", run, 0);
  const started = (itemId: string) => ({
    kind: "tool_started" as const,
    itemId,
    data: { itemType: "tool", title: "ls" },
  });
  await store.events.append("org-1", run, [started("a")], 0);
  expect(await store.events.unfinishedTool("org-1", run)).toBe(true);
  await store.events.append(
    "org-1",
    run,
    [{ kind: "tool_completed", itemId: "a", data: { status: "completed" } }],
    1,
  );
  expect(await store.events.unfinishedTool("org-1", run)).toBe(false);
  await store.turnRuns.begin("org-1", { ...run, attempt: 2 }, 2);
  expect(await store.events.unfinishedTool("org-1", { ...run, attempt: 2 })).toBe(false);
});
