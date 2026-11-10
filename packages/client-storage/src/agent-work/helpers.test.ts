import { HelperLimitError } from "./helpers.ts";
import { createSession, openTestStore } from "./test-support.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";

let fixture: Awaited<ReturnType<typeof openTestStore>>;
beforeEach(async () => {
  fixture = await openTestStore();
});
afterEach(() => fixture.cleanup());

test("an agent runs at most two helpers, and a repeated request returns the same helper", async () => {
  const { store } = fixture;
  const parent = await createSession(store);
  const first = await store.helpers.start(parent.id, { requestId: "r1", task: "A" }, 0);
  expect(await store.helpers.start(parent.id, { requestId: "r1", task: "A" }, 1)).toEqual(first);
  await store.helpers.start(parent.id, { requestId: "r2", task: "B" }, 2);
  // oxlint-disable-next-line typescript/await-thenable -- Bun rejection assertions are asynchronous despite their assertion return declarations.
  await expect(store.helpers.start(parent.id, { requestId: "r3", task: "C" }, 3)).rejects.toThrow(
    HelperLimitError,
  );
  await store.helpers.stop(first.id, 4);
  expect((await store.helpers.start(parent.id, { requestId: "r3", task: "C" }, 5)).task).toBe("C");
});

test("a helper runs in its own slot with its task as input", async () => {
  const { store } = fixture;
  const parent = await createSession(store);
  const helper = await store.helpers.start(parent.id, { requestId: "r1", task: "Research" }, 0);
  const claimed = await store.turns.claim(1, { organizationId: "org-1" });
  const helperTurn = claimed.find((entry) => entry.session.id === helper.sessionId);
  expect(helperTurn!.turn.folderKey).toBe(`helper:${helper.id}`);
  expect(helperTurn!.items.map((row) => [row.source, row.body])).toEqual([
    ["helper_task", "Research"],
  ]);
});

test("finishing a helper stores its report and wakes the parent in the background lane", async () => {
  const { store } = fixture;
  const parent = await createSession(store);
  const helper = await store.helpers.start(parent.id, { requestId: "r1", task: "Research" }, 0);
  const finished = await store.helpers.finish(helper.sessionId, "Found it.", 1);
  expect(finished).toMatchObject({ status: "finished", report: "Found it." });
  const [result] = await store.inbox.openForSessions([parent.id]);
  expect(result).toMatchObject({
    source: "helper_result",
    lane: "background",
    body: "Found it.",
    sourceRef: { source: "helper_result", helperId: helper.id },
  });
});
